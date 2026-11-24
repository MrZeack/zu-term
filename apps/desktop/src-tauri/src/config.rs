use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime};

use tauri::{State, command};

const CONFIG_DIR_NAME: &str = "zu-term";
pub(crate) const CONFIG_FILE_NAME: &str = "config.json";
const HISTORY_DIR_NAME: &str = "history";
const HISTORY_SUFFIXES: &[&str] = &[".zsh_history", ".bash_history"];
const FISH_HISTORY_PREFIX: &str = "zu_term_";
const FISH_HISTORY_SUFFIX: &str = "_history";
const MAX_CONFIG_BYTES: usize = 4 * 1024 * 1024;
const MAX_HISTORY_ID_BYTES: usize = 96;

/// Directories resolved once at startup; the app refuses to start without a
/// home directory instead of falling back to `/`.
pub struct AppPaths {
    pub home: PathBuf,
    pub config: PathBuf,
}

impl AppPaths {
    pub fn from_home(home: PathBuf) -> Self {
        let config = home.join(".config").join(CONFIG_DIR_NAME);
        Self { home, config }
    }
}

pub(crate) fn set_private_permissions(path: &Path, mode: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(mode))
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
    }
    Ok(())
}

pub(crate) fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    set_private_permissions(path, 0o700)
}

/// Options for a new file that is private from the moment it exists.
pub(crate) fn private_file_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

pub(crate) fn valid_history_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= MAX_HISTORY_ID_BYTES
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && bytes[0].is_ascii_alphanumeric()
}

pub(crate) fn history_file_for_shell(
    config: &Path,
    history_id: Option<&str>,
    shell: &str,
) -> Result<Option<PathBuf>, String> {
    let Some(history_id) = history_id else { return Ok(None) };
    if !valid_history_id(history_id) {
        return Err("invalid history id".into());
    }
    let suffix = match Path::new(shell).file_name().and_then(|s| s.to_str()) {
        Some("bash") => ".bash_history",
        Some("fish") => return Ok(None),
        _ => ".zsh_history",
    };
    let directory = config.join(HISTORY_DIR_NAME);
    ensure_private_dir(&directory)?;
    Ok(Some(directory.join(format!("{history_id}{suffix}"))))
}

/// Where fish keeps history files: `$XDG_DATA_HOME/fish`, or
/// `~/.local/share/fish` when that is unset or not absolute.
pub(crate) fn fish_history_dir(home: &Path, xdg_data_home: Option<PathBuf>) -> PathBuf {
    xdg_data_home
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".local").join("share"))
        .join("fish")
}

/// The file fish uses for a pane (see `fish_history` in shell/zu-term.fish).
fn fish_history_name(id: &str) -> String {
    let session: String =
        id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' }).collect();
    format!("{FISH_HISTORY_PREFIX}{session}{FISH_HISTORY_SUFFIX}")
}

fn remove_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_file())
        && fs::remove_file(path).is_ok()
}

pub(crate) fn remove_history_files(
    config: &Path,
    fish: Option<&Path>,
    ids: &BTreeSet<String>,
) -> usize {
    let directory = config.join(HISTORY_DIR_NAME);
    let mut removed = 0;
    for id in ids.iter().filter(|id| valid_history_id(id)) {
        for suffix in HISTORY_SUFFIXES {
            removed += usize::from(remove_regular_file(&directory.join(format!("{id}{suffix}"))));
        }
        if let Some(fish) = fish {
            removed += usize::from(remove_regular_file(&fish.join(fish_history_name(id))));
        }
    }
    removed
}

fn is_older_than(meta: &fs::Metadata, now: SystemTime, min_age: Duration) -> bool {
    meta.modified().ok().and_then(|m| now.duration_since(m).ok()).unwrap_or_default() >= min_age
}

/// Removes history files not referenced by any saved workspace once they are
/// older than `min_age`, keeping ephemeral splits in other open windows safe.
/// In fish's folder it only touches Zu Term's `zu_term_*_history` files.
pub(crate) fn prune_orphan_histories(
    config: &Path,
    fish: Option<&Path>,
    referenced_ids: &BTreeSet<String>,
    min_age: Duration,
) -> usize {
    let now = SystemTime::now();
    let mut removed = 0;

    if let Ok(entries) = fs::read_dir(config.join(HISTORY_DIR_NAME)) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            let Some(stem) = HISTORY_SUFFIXES.iter().find_map(|suffix| name.strip_suffix(suffix))
            else {
                continue;
            };
            if meta.file_type().is_file()
                && valid_history_id(stem)
                && !referenced_ids.contains(stem)
                && is_older_than(&meta, now, min_age)
                && fs::remove_file(&path).is_ok()
            {
                removed += 1;
            }
        }
    }

    let Some(fish) = fish else { return removed };
    let referenced: BTreeSet<String> =
        referenced_ids.iter().map(|id| fish_history_name(id)).collect();
    if let Ok(entries) = fs::read_dir(fish) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if meta.file_type().is_file()
                && name.starts_with(FISH_HISTORY_PREFIX)
                && name.ends_with(FISH_HISTORY_SUFFIX)
                && !referenced.contains(name)
                && is_older_than(&meta, now, min_age)
                && fs::remove_file(&path).is_ok()
            {
                removed += 1;
            }
        }
    }
    removed
}

pub(crate) fn read_config_in(directory: &Path) -> Result<Option<String>, String> {
    let file = match File::open(directory.join(CONFIG_FILE_NAME)) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_CONFIG_BYTES {
        return Err("config file is too large".into());
    }
    String::from_utf8(bytes).map(Some).map_err(|error| error.to_string())
}

/// Persists a rename by syncing its directory entry (Unix only).
fn sync_dir(directory: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    File::open(directory)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = directory;
    Ok(())
}

pub(crate) fn write_config_in(directory: &Path, data: &str) -> Result<(), String> {
    if data.len() > MAX_CONFIG_BYTES {
        return Err("config file is too large".into());
    }
    write_private_file(directory, CONFIG_FILE_NAME, data)
}

/// Writes a private sibling temporary file and renames it over `name`, so a
/// crash leaves either the old or the new content, never a truncated file.
pub(crate) fn write_private_file(directory: &Path, name: &str, data: &str) -> Result<(), String> {
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
    ensure_private_dir(directory)?;
    let temp = directory.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let result = private_file_options()
        .write(true)
        .create_new(true)
        .open(&temp)
        .and_then(|mut file| {
            file.write_all(data.as_bytes())?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temp, directory.join(name)))
        .and_then(|()| sync_dir(directory));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|error| error.to_string())
}

#[command]
pub fn config_read(paths: State<'_, AppPaths>) -> Result<Option<String>, String> {
    read_config_in(&paths.config)
}

#[cfg(test)]
pub(crate) fn test_dir(name: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let suffix = NEXT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("zu-term-{name}-{}-{suffix}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_requested_config_directory() {
        let paths = AppPaths::from_home(PathBuf::from("/Users/me"));
        assert_eq!(paths.home, Path::new("/Users/me"));
        assert_eq!(paths.config, Path::new("/Users/me/.config/zu-term"));
    }

    #[test]
    fn replaces_the_config_atomically_with_private_permissions() {
        let directory = test_dir("config");
        fs::create_dir_all(&directory).expect("dir");
        let path = directory.join(CONFIG_FILE_NAME);
        fs::write(&path, "old").expect("seed");
        set_private_permissions(&path, 0o644).expect("chmod");

        write_config_in(&directory, "{\"version\":1}").expect("write");

        assert_eq!(read_config_in(&directory), Ok(Some("{\"version\":1}".into())));
        let entries = fs::read_dir(&directory).expect("list").count();
        assert_eq!(entries, 1, "temporary files must not be left behind");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).expect("meta").permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn treats_a_missing_config_as_empty_and_rejects_oversized_data() {
        let directory = test_dir("config-limits");
        assert_eq!(read_config_in(&directory), Ok(None));
        assert!(write_config_in(&directory, &"x".repeat(MAX_CONFIG_BYTES + 1)).is_err());

        fs::create_dir_all(&directory).expect("dir");
        fs::write(directory.join(CONFIG_FILE_NAME), "x".repeat(MAX_CONFIG_BYTES + 1))
            .expect("seed");
        assert!(read_config_in(&directory).is_err());
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn accepts_only_safe_history_ids() {
        assert!(valid_history_id("pane-abc_123"));
        assert!(!valid_history_id("../outside"));
        assert!(!valid_history_id("history/id"));
        assert!(!valid_history_id(""));
    }

    #[test]
    fn chooses_shell_specific_history_extension() {
        let directory = test_dir("history-ext");
        assert!(
            history_file_for_shell(&directory, Some("pane-1"), "/bin/zsh")
                .unwrap()
                .unwrap()
                .ends_with("pane-1.zsh_history")
        );
        assert!(
            history_file_for_shell(&directory, Some("pane-1"), "/usr/bin/bash")
                .unwrap()
                .unwrap()
                .ends_with("pane-1.bash_history")
        );
        assert!(
            history_file_for_shell(&directory, Some("pane-1"), "/usr/bin/fish").unwrap().is_none()
        );
        fs::remove_dir_all(directory).expect("cleanup");
    }

    // fish keeps its own history files (`zu_term_<id>_history`, with `-`
    // and `.` turned into `_`) in its data folder, next to the user's own.
    #[test]
    fn prunes_and_removes_fish_histories_of_zu_term_only() {
        use std::collections::BTreeSet;
        use std::time::Duration;

        let directory = test_dir("prune-fish-history");
        let fish = directory.join("fish");
        fs::create_dir_all(&fish).expect("fish dir");
        for name in [
            "zu_term_pane_keep_history",
            "zu_term_pane_drop_history",
            "zu_term_pane_gone_history",
            "fish_history",
        ] {
            fs::write(fish.join(name), "- cmd: ls\n").unwrap();
        }

        let keep = BTreeSet::from(["pane-keep".to_string()]);
        assert_eq!(prune_orphan_histories(&directory, Some(&fish), &keep, Duration::ZERO), 2);
        assert!(fish.join("zu_term_pane_keep_history").is_file());
        assert!(!fish.join("zu_term_pane_drop_history").exists());
        assert!(fish.join("fish_history").is_file(), "the user's own history stays");

        let removed = BTreeSet::from(["pane-keep".to_string()]);
        assert_eq!(remove_history_files(&directory, Some(&fish), &removed), 1);
        assert!(!fish.join("zu_term_pane_keep_history").exists());
        assert!(fish.join("fish_history").is_file());

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn fish_history_folder_follows_xdg_data_home() {
        let home = Path::new("/home/me");
        assert_eq!(fish_history_dir(home, None), home.join(".local/share/fish"));
        assert_eq!(fish_history_dir(home, Some("/data".into())), PathBuf::from("/data/fish"));
        // A relative XDG_DATA_HOME is invalid per the spec: fish ignores it.
        assert_eq!(fish_history_dir(home, Some("data".into())), home.join(".local/share/fish"));
    }

    #[test]
    fn prunes_only_unreferenced_history_files_past_grace_period() {
        use std::collections::BTreeSet;
        use std::time::Duration;

        let directory = test_dir("prune-history");
        let history_dir = directory.join(HISTORY_DIR_NAME);
        fs::create_dir_all(&history_dir).expect("history dir");
        fs::write(history_dir.join("pane-keep.zsh_history"), "echo keep\n").unwrap();
        fs::write(history_dir.join("pane-drop.zsh_history"), "echo drop\n").unwrap();
        fs::write(history_dir.join("notes.txt"), "not a history file\n").unwrap();

        let keep = BTreeSet::from(["pane-keep".to_string()]);
        // With a long grace period, freshly created files are spared.
        assert_eq!(prune_orphan_histories(&directory, None, &keep, Duration::from_secs(3600)), 0);
        assert!(history_dir.join("pane-drop.zsh_history").is_file());

        // With zero grace period, unreferenced history files are removed while referenced & other files stay.
        assert_eq!(prune_orphan_histories(&directory, None, &keep, Duration::ZERO), 1);
        assert!(history_dir.join("pane-keep.zsh_history").is_file());
        assert!(!history_dir.join("pane-drop.zsh_history").exists());
        assert!(history_dir.join("notes.txt").is_file());

        fs::remove_dir_all(directory).expect("cleanup");
    }
}
