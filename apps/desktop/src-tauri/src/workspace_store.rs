use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{Map, Value, json};
use tauri::{AppHandle, Emitter, State, WebviewWindow, command};

use crate::config::{
    AppPaths, CONFIG_FILE_NAME, ensure_private_dir, private_file_options, read_config_in,
    write_config_in,
};
use crate::workspace_lock::{WorkspaceLocks, validate_workspace_id};

pub const WORKSPACES_UPDATED_EVENT: &str = "zu-term://workspaces-updated";
const LOCK_FILE_NAME: &str = "config.json.lock";
const MAX_WORKSPACES: usize = 24;
const MAX_WORKSPACE_BYTES: usize = 1 << 20;
const MAX_FONT_ID_BYTES: usize = 64;
const FONT_SIZES: std::ops::RangeInclusive<u64> = 9..=28;

/// The only writer of `config.json`. Every change is a read-modify-write of
/// the file under an in-process mutex and an OS file lock, so windows and
/// instances never overwrite each other's workspaces. A window may only save
/// the workspace it holds the lock for, and may not delete one that another
/// window has open.
pub struct ConfigStore {
    directory: PathBuf,
    guard: Mutex<()>,
}

type Config = Map<String, Value>;

fn default_config() -> Config {
    let Value::Object(config) = json!({
        "version": 1,
        "theme": "cyan",
        "workspaceCatalog": { "version": 1, "activeId": null, "workspaces": [] },
    }) else {
        unreachable!("literal object")
    };
    config
}

fn parse_config(raw: &str) -> Option<Config> {
    let Ok(Value::Object(config)) = serde_json::from_str::<Value>(raw) else { return None };
    let has_catalog = config
        .get("workspaceCatalog")
        .and_then(|catalog| catalog.get("workspaces"))
        .is_some_and(Value::is_array);
    (config.get("version") == Some(&json!(1)) && has_catalog).then_some(config)
}

fn workspaces(config: &mut Config) -> Result<&mut Vec<Value>, String> {
    config
        .get_mut("workspaceCatalog")
        .and_then(|catalog| catalog.get_mut("workspaces"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "config.json no tiene un catálogo válido".to_string())
}

fn workspace_id(workspace: &Value) -> Option<&str> {
    workspace.get("id").and_then(Value::as_str)
}

impl ConfigStore {
    pub fn new(paths: &AppPaths) -> Self {
        Self::in_directory(paths.config.clone())
    }

    fn in_directory(directory: PathBuf) -> Self {
        Self { directory, guard: Mutex::default() }
    }

    /// Runs `task` holding both the in-process mutex and the OS file lock.
    fn locked<T>(&self, task: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let _guard = self.guard.lock().map_err(|_| "config store poisoned".to_string())?;
        ensure_private_dir(&self.directory)?;
        let lock = private_file_options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.directory.join(LOCK_FILE_NAME))
            .map_err(|error| error.to_string())?;
        lock.lock().map_err(|error| error.to_string())?;
        task()
    }

    fn write(&self, mut config: Config) -> Result<(), String> {
        // Which workspace a window has open is window state, never persisted.
        if let Some(catalog) = config.get_mut("workspaceCatalog").and_then(Value::as_object_mut) {
            catalog.insert("activeId".into(), Value::Null);
        }
        let data = serde_json::to_string(&config).map_err(|error| error.to_string())?;
        write_config_in(&self.directory, &data)
    }

    /// Applies `change` to the current file and writes it back atomically.
    /// `change` returns whether something changed; nothing is written if not.
    /// An unreadable file is never overwritten here.
    fn update(
        &self,
        change: impl FnOnce(&mut Config) -> Result<bool, String>,
    ) -> Result<bool, String> {
        self.locked(|| {
            let mut config = match read_config_in(&self.directory)? {
                None => default_config(),
                Some(raw) => parse_config(&raw).ok_or("config.json no es válido")?,
            };
            if !change(&mut config)? {
                return Ok(false);
            }
            self.write(config)?;
            Ok(true)
        })
    }

    /// Writes the first config (e.g. migrated from localStorage) only when
    /// there is no valid file yet. An invalid file is kept as
    /// `config.json.invalid` instead of being lost.
    pub fn import(&self, raw: &str) -> Result<bool, String> {
        let imported = parse_config(raw).ok_or("config importada no válida")?;
        self.locked(|| {
            match read_config_in(&self.directory) {
                Ok(None) => {}
                Ok(Some(current)) if parse_config(&current).is_some() => return Ok(false),
                Ok(Some(_)) | Err(_) => {
                    let path = self.directory.join(CONFIG_FILE_NAME);
                    fs::rename(&path, path.with_extension("json.invalid"))
                        .map_err(|error| error.to_string())?;
                }
            }
            self.write(imported)?;
            Ok(true)
        })
    }

    pub fn save_settings(
        &self,
        theme: &str,
        font_family: &str,
        font_size: u64,
    ) -> Result<bool, String> {
        if theme != "cyan" && theme != "mint" {
            return Err("tema no válido".into());
        }
        let valid_font = !font_family.is_empty()
            && font_family.len() <= MAX_FONT_ID_BYTES
            && font_family
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !valid_font || !FONT_SIZES.contains(&font_size) {
            return Err("tipografía no válida".into());
        }
        self.update(|config| {
            config.insert("theme".into(), json!(theme));
            config.insert("fontFamily".into(), json!(font_family));
            config.insert("fontSize".into(), json!(font_size));
            Ok(true)
        })
    }

    pub fn save_workspace(
        &self,
        locks: &WorkspaceLocks,
        owner: &str,
        workspace: Value,
    ) -> Result<bool, String> {
        let id = workspace_id(&workspace).ok_or("workspace sin id")?.to_owned();
        validate_workspace_id(&id)?;
        let size = serde_json::to_string(&workspace).map_err(|error| error.to_string())?.len();
        if !workspace.is_object() || size > MAX_WORKSPACE_BYTES {
            return Err("workspace no válido".into());
        }
        if !locks.is_held_by(&id, owner)? {
            return Err("el workspace no está abierto en esta ventana".into());
        }
        self.update(|config| {
            let workspaces = workspaces(config)?;
            match workspaces.iter().position(|item| workspace_id(item) == Some(id.as_str())) {
                Some(index) => workspaces[index] = workspace,
                None if workspaces.len() >= MAX_WORKSPACES => {
                    return Err(format!("ya existen {MAX_WORKSPACES} workspaces"));
                }
                None => workspaces.push(workspace),
            }
            Ok(true)
        })
    }

    /// `false` if another window or instance has the workspace open.
    pub fn delete_workspace(
        &self,
        locks: &WorkspaceLocks,
        owner: &str,
        id: &str,
    ) -> Result<bool, String> {
        validate_workspace_id(id)?;
        let already_held = locks.is_held_by(id, owner)?;
        if !already_held && !locks.acquire(id, owner)? {
            return Ok(false);
        }
        let result = self.update(|config| {
            let workspaces = workspaces(config)?;
            let before = workspaces.len();
            workspaces.retain(|item| workspace_id(item) != Some(id));
            Ok(workspaces.len() != before)
        });
        if !already_held {
            locks.release(id, owner)?;
        }
        result.map(|_| true)
    }
}

fn notify(app: &AppHandle, changed: bool) {
    if changed {
        let _ = app.emit(WORKSPACES_UPDATED_EVENT, ());
    }
}

#[command]
pub async fn config_import(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: String,
) -> Result<bool, String> {
    let changed = store.import(&data)?;
    notify(&app, changed);
    Ok(changed)
}

#[command]
pub async fn settings_save(
    store: State<'_, ConfigStore>,
    theme: String,
    font_family: String,
    font_size: u64,
) -> Result<(), String> {
    store.save_settings(&theme, &font_family, font_size).map(|_| ())
}

#[command]
pub async fn workspace_save(
    app: AppHandle,
    window: WebviewWindow,
    store: State<'_, ConfigStore>,
    locks: State<'_, WorkspaceLocks>,
    workspace: Value,
) -> Result<(), String> {
    let changed = store.save_workspace(&locks, window.label(), workspace)?;
    notify(&app, changed);
    Ok(())
}

#[command]
pub async fn workspace_delete(
    app: AppHandle,
    window: WebviewWindow,
    store: State<'_, ConfigStore>,
    locks: State<'_, WorkspaceLocks>,
    workspace_id: String,
) -> Result<bool, String> {
    let deleted = store.delete_workspace(&locks, window.label(), &workspace_id)?;
    notify(&app, deleted);
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::{Value, json};

    use super::ConfigStore;
    use crate::config::{CONFIG_FILE_NAME, read_config_in, test_dir};
    use crate::workspace_lock::WorkspaceLocks;

    struct Fixture {
        root: std::path::PathBuf,
        store: ConfigStore,
        locks: WorkspaceLocks,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let root = test_dir(&format!("store-{label}"));
            let store = ConfigStore::in_directory(root.join("config"));
            let locks = WorkspaceLocks::in_directory(root.join("locks"));
            Self { root, store, locks }
        }

        fn config(&self) -> Value {
            let raw = read_config_in(&self.root.join("config")).unwrap().expect("config");
            serde_json::from_str(&raw).unwrap()
        }

        fn names(&self) -> Vec<String> {
            self.config()["workspaceCatalog"]["workspaces"]
                .as_array()
                .unwrap()
                .iter()
                .map(|w| w["name"].as_str().unwrap().to_owned())
                .collect()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn workspace(id: &str, name: &str) -> Value {
        json!({ "id": id, "name": name, "snapshot": {}, "updatedAt": 1 })
    }

    #[test]
    fn a_window_only_saves_the_workspace_it_has_open() {
        let f = Fixture::new("owner");
        assert_eq!(f.locks.acquire("ws-1", "main"), Ok(true));

        assert_eq!(f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno")), Ok(true));
        assert!(f.store.save_workspace(&f.locks, "other", workspace("ws-1", "Pisado")).is_err());
        assert!(f.store.save_workspace(&f.locks, "main", workspace("ws-2", "Sin lock")).is_err());
        assert_eq!(f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno v2")), Ok(true));

        assert_eq!(f.names(), ["Uno v2"]);
    }

    #[test]
    fn saves_from_two_windows_keep_both_workspaces() {
        let f = Fixture::new("merge");
        f.locks.acquire("ws-1", "main").unwrap();
        f.locks.acquire("ws-2", "second").unwrap();

        f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno")).unwrap();
        f.store.save_workspace(&f.locks, "second", workspace("ws-2", "Dos")).unwrap();
        f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno v2")).unwrap();
        f.store.save_settings("mint", "fira-code", 14).unwrap();

        assert_eq!(f.names(), ["Uno v2", "Dos"]);
        let config = f.config();
        assert_eq!(config["theme"], "mint");
        assert_eq!(config["workspaceCatalog"]["activeId"], Value::Null);
    }

    #[test]
    fn refuses_to_delete_a_workspace_open_in_another_window() {
        let f = Fixture::new("delete");
        f.locks.acquire("ws-1", "main").unwrap();
        f.locks.acquire("ws-2", "main").unwrap();
        f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno")).unwrap();
        f.store.save_workspace(&f.locks, "main", workspace("ws-2", "Dos")).unwrap();
        f.locks.release("ws-2", "main").unwrap();

        assert_eq!(f.store.delete_workspace(&f.locks, "other", "ws-1"), Ok(false));
        assert_eq!(f.store.delete_workspace(&f.locks, "other", "ws-2"), Ok(true));
        assert_eq!(f.locks.acquire("ws-2", "main"), Ok(true), "the temporary lock is released");
        assert_eq!(f.store.delete_workspace(&f.locks, "main", "ws-1"), Ok(true));

        assert!(f.names().is_empty());
    }

    #[test]
    fn imports_only_when_no_valid_config_exists() {
        let f = Fixture::new("import");
        let first = json!({ "version": 1, "theme": "mint", "workspaceCatalog": {
            "version": 1, "activeId": "ws-1", "workspaces": [workspace("ws-1", "Uno")] } });

        assert_eq!(f.store.import(&first.to_string()), Ok(true));
        assert_eq!(f.store.import(&first.to_string()), Ok(false));
        assert_eq!(f.names(), ["Uno"]);
        assert_eq!(f.config()["workspaceCatalog"]["activeId"], Value::Null);
        assert!(f.store.import("{}").is_err());
    }

    #[test]
    fn never_overwrites_an_unreadable_config() {
        let f = Fixture::new("corrupt");
        let directory = f.root.join("config");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(CONFIG_FILE_NAME), "{ not json").unwrap();
        f.locks.acquire("ws-1", "main").unwrap();

        assert!(f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno")).is_err());
        assert_eq!(fs::read_to_string(directory.join(CONFIG_FILE_NAME)).unwrap(), "{ not json");

        let fresh = json!({ "version": 1, "theme": "cyan", "workspaceCatalog": {
            "version": 1, "activeId": null, "workspaces": [] } });
        assert_eq!(f.store.import(&fresh.to_string()), Ok(true));
        assert_eq!(
            fs::read_to_string(directory.join("config.json.invalid")).unwrap(),
            "{ not json",
            "the unreadable file is kept as a backup",
        );
        assert_eq!(f.store.save_workspace(&f.locks, "main", workspace("ws-1", "Uno")), Ok(true));
    }

    #[test]
    fn validates_settings_ids_limits_and_size() {
        let f = Fixture::new("validate");
        assert!(f.store.save_settings("red", "fira-code", 14).is_err());
        assert!(f.store.save_settings("cyan", "../x", 14).is_err());
        assert!(f.store.save_settings("cyan", "fira-code", 99).is_err());

        f.locks.acquire("ws-1", "main").unwrap();
        let huge = json!({ "id": "ws-1", "blob": "x".repeat(super::MAX_WORKSPACE_BYTES) });
        assert!(f.store.save_workspace(&f.locks, "main", huge).is_err());
        assert!(f.store.save_workspace(&f.locks, "main", json!({ "id": "../x" })).is_err());

        for index in 0..super::MAX_WORKSPACES {
            let id = format!("ws-{index}");
            f.locks.acquire(&id, "main").unwrap();
            f.store.save_workspace(&f.locks, "main", workspace(&id, "n")).unwrap();
        }
        f.locks.acquire("ws-extra", "main").unwrap();
        assert!(f.store.save_workspace(&f.locks, "main", workspace("ws-extra", "n")).is_err());
    }
}
