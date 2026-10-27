use std::collections::HashMap;
use std::fs::{File, TryLockError};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use tauri::{State, WebviewWindow, command};

use crate::config::{AppPaths, ensure_private_dir, private_file_options};

const WORKSPACE_LOCK_DIR_NAME: &str = "workspace-locks";
const MAX_WORKSPACE_ID_BYTES: usize = 96;

struct HeldLock {
    owner: String,
    // Keeps the OS lock alive; dropping it releases the workspace.
    _file: File,
}

/// Which window owns each workspace. Windows of this process are told apart
/// in memory; other processes through an OS file lock, which the kernel
/// releases when the process dies, so a crash never leaves a stale lock.
pub struct WorkspaceLocks {
    directory: PathBuf,
    held: Mutex<HashMap<String, HeldLock>>,
}

fn valid_workspace_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= MAX_WORKSPACE_ID_BYTES
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

pub(crate) fn validate_workspace_id(value: &str) -> Result<(), String> {
    valid_workspace_id(value).then_some(()).ok_or_else(|| "invalid workspace id".into())
}

impl WorkspaceLocks {
    pub fn new(paths: &AppPaths) -> Self {
        Self::in_directory(paths.config.join(WORKSPACE_LOCK_DIR_NAME))
    }

    pub(crate) fn in_directory(directory: PathBuf) -> Self {
        Self { directory, held: Mutex::default() }
    }

    fn held(&self) -> Result<MutexGuard<'_, HashMap<String, HeldLock>>, String> {
        self.held.lock().map_err(|_| "workspace locks poisoned".to_string())
    }

    fn lock_path(&self, workspace_id: &str) -> PathBuf {
        self.directory.join(format!("{workspace_id}.lock"))
    }

    pub fn acquire(&self, workspace_id: &str, owner: &str) -> Result<bool, String> {
        validate_workspace_id(workspace_id)?;
        let mut held = self.held()?;
        if let Some(lock) = held.get(workspace_id) {
            return Ok(lock.owner == owner);
        }
        ensure_private_dir(&self.directory)?;
        let file = open_lock_file(&self.lock_path(workspace_id))?;
        match file.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Ok(false),
            Err(TryLockError::Error(error)) => return Err(error.to_string()),
        }
        held.insert(workspace_id.to_owned(), HeldLock { owner: owner.to_owned(), _file: file });
        Ok(true)
    }

    /// `false` only when another window of this process owns the workspace.
    pub fn release(&self, workspace_id: &str, owner: &str) -> Result<bool, String> {
        validate_workspace_id(workspace_id)?;
        let mut held = self.held()?;
        match held.get(workspace_id) {
            Some(lock) if lock.owner != owner => Ok(false),
            Some(_) => {
                held.remove(workspace_id);
                Ok(true)
            }
            None => Ok(true),
        }
    }

    /// Whether `owner` (a window of this process) holds the workspace.
    pub fn is_held_by(&self, workspace_id: &str, owner: &str) -> Result<bool, String> {
        Ok(self.held()?.get(workspace_id).is_some_and(|lock| lock.owner == owner))
    }

    pub fn release_all(&self, owner: &str) -> Result<(), String> {
        self.held()?.retain(|_, lock| lock.owner != owner);
        Ok(())
    }
}

fn open_lock_file(path: &Path) -> Result<File, String> {
    private_file_options()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|error| error.to_string())
}

// The owner is always the calling window's label, never a client value.
#[command]
pub fn workspace_lock_acquire(
    window: WebviewWindow,
    locks: State<'_, WorkspaceLocks>,
    workspace_id: String,
) -> Result<bool, String> {
    locks.acquire(&workspace_id, window.label())
}

#[command]
pub fn workspace_lock_release(
    window: WebviewWindow,
    locks: State<'_, WorkspaceLocks>,
    workspace_id: String,
) -> Result<bool, String> {
    locks.release(&workspace_id, window.label())
}

#[command]
pub fn workspace_lock_release_all(
    window: WebviewWindow,
    locks: State<'_, WorkspaceLocks>,
) -> Result<(), String> {
    locks.release_all(window.label())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::WorkspaceLocks;
    use crate::config::test_dir;

    #[test]
    fn only_one_window_can_own_a_workspace_and_the_owner_can_release_it() {
        let directory = test_dir("locks");
        let locks = WorkspaceLocks::in_directory(directory.clone());

        assert_eq!(locks.acquire("ws-1", "main"), Ok(true));
        assert_eq!(locks.acquire("ws-1", "main"), Ok(true), "re-acquiring is idempotent");
        assert_eq!(locks.acquire("ws-1", "other-window"), Ok(false));
        assert_eq!(locks.release("ws-1", "other-window"), Ok(false));
        assert_eq!(locks.release("ws-1", "main"), Ok(true));
        assert_eq!(locks.acquire("ws-1", "other-window"), Ok(true));

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn releasing_all_locks_frees_only_the_window_workspaces() {
        let directory = test_dir("locks-all");
        let locks = WorkspaceLocks::in_directory(directory.clone());

        assert_eq!(locks.acquire("ws-1", "main"), Ok(true));
        assert_eq!(locks.acquire("ws-2", "main"), Ok(true));
        assert_eq!(locks.acquire("ws-3", "other-window"), Ok(true));
        locks.release_all("main").expect("release all");
        assert_eq!(locks.acquire("ws-1", "next"), Ok(true));
        assert_eq!(locks.acquire("ws-2", "next"), Ok(true));
        assert_eq!(locks.acquire("ws-3", "next"), Ok(false));

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn another_process_waits_until_the_owner_exits() {
        let directory = test_dir("locks-process");
        let first = WorkspaceLocks::in_directory(directory.clone());
        let second = WorkspaceLocks::in_directory(directory.clone());

        assert_eq!(first.acquire("ws-1", "main"), Ok(true));
        assert_eq!(second.acquire("ws-1", "main"), Ok(false));
        drop(first); // the process exits or crashes
        assert_eq!(second.acquire("ws-1", "main"), Ok(true));

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn leftover_or_corrupt_lock_files_do_not_block_a_workspace() {
        let directory = test_dir("locks-corrupt");
        fs::create_dir_all(&directory).expect("dir");
        fs::write(directory.join("ws-1.lock"), "").expect("empty lock");
        fs::write(directory.join("ws-2.lock"), "pid=garbage").expect("corrupt lock");
        let locks = WorkspaceLocks::in_directory(directory.clone());

        assert_eq!(locks.acquire("ws-1", "main"), Ok(true));
        assert_eq!(locks.acquire("ws-2", "main"), Ok(true));

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn rejects_unsafe_workspace_ids() {
        let locks = WorkspaceLocks::in_directory(test_dir("locks-invalid"));
        assert!(locks.acquire("../outside", "main").is_err());
        assert!(locks.acquire("", "main").is_err());
        assert!(locks.release("a/b", "main").is_err());
    }
}
