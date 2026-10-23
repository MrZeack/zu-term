use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::command;

const CONFIG_DIR_NAME: &str = "zu-term";
const CONFIG_FILE_NAME: &str = "config.json";
const HISTORY_DIR_NAME: &str = "history";
const MAX_CONFIG_BYTES: usize = 4 * 1024 * 1024;
const MAX_HISTORY_ID_BYTES: usize = 96;

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

fn config_dir_for(home: &Path) -> PathBuf {
    home.join(".config").join(CONFIG_DIR_NAME)
}

pub(crate) fn config_dir() -> PathBuf {
    config_dir_for(&home_dir())
}

fn set_private_permissions(path: &Path, mode: u32) -> Result<(), String> {
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

fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    set_private_permissions(path, 0o700)
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

pub(crate) fn history_file(history_id: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(history_id) = history_id else { return Ok(None) };
    if !valid_history_id(history_id) {
        return Err("invalid history id".into());
    }
    let directory = config_dir().join(HISTORY_DIR_NAME);
    ensure_private_dir(&directory)?;
    Ok(Some(directory.join(format!("{history_id}.zsh_history"))))
}

#[command]
pub fn config_read() -> Result<Option<String>, String> {
    let path = config_dir().join(CONFIG_FILE_NAME);
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if bytes.len() > MAX_CONFIG_BYTES {
        return Err("config file is too large".into());
    }
    String::from_utf8(bytes).map(Some).map_err(|error| error.to_string())
}

#[command]
pub fn config_write(data: String) -> Result<(), String> {
    if data.len() > MAX_CONFIG_BYTES {
        return Err("config file is too large".into());
    }
    let directory = config_dir();
    ensure_private_dir(&directory)?;
    let path = directory.join(CONFIG_FILE_NAME);
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    set_private_permissions(&path, 0o600)?;
    file.write_all(data.as_bytes()).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{config_dir_for, valid_history_id};
    use std::path::Path;

    #[test]
    fn uses_the_requested_config_directory() {
        assert_eq!(config_dir_for(Path::new("/Users/me")), Path::new("/Users/me/.config/zu-term"));
    }

    #[test]
    fn accepts_only_safe_history_ids() {
        assert!(valid_history_id("pane-abc_123"));
        assert!(!valid_history_id("../outside"));
        assert!(!valid_history_id("history/id"));
        assert!(!valid_history_id(""));
    }
}
