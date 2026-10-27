use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{State, command};

const CONFIG_DIR_NAME: &str = "zu-term";
pub(crate) const CONFIG_FILE_NAME: &str = "config.json";
const HISTORY_DIR_NAME: &str = "history";
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

fn valid_history_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= MAX_HISTORY_ID_BYTES
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && bytes[0].is_ascii_alphanumeric()
}

pub(crate) fn history_file(
    config: &Path,
    history_id: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let Some(history_id) = history_id else { return Ok(None) };
    if !valid_history_id(history_id) {
        return Err("invalid history id".into());
    }
    let directory = config.join(HISTORY_DIR_NAME);
    ensure_private_dir(&directory)?;
    Ok(Some(directory.join(format!("{history_id}.zsh_history"))))
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
}
