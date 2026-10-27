use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunProcessInfo {
    pub name: String,
    pub pid: u32,
    pub project_dir: String,
}

pub const RUN_DIRS: &[&str] = &[".run", ".runtime"];
/// One `cwd` and one `startCwd` per pane, with up to 32 panes per window.
pub const MAX_CWDS: usize = 64;
const MAX_PATH_BYTES: usize = 4096;
const MAX_PID_FILE_BYTES: u64 = 32;

/// Checks if a PID corresponds to a running process on Unix.
#[cfg(unix)]
pub fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let res = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if res == 0 {
        true
    } else {
        std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
}

#[cfg(not(unix))]
pub fn is_process_alive(_pid: u32) -> bool {
    false
}

/// A real directory or file, never a symlink that could point elsewhere.
fn is_real(path: &Path, directory: bool) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| {
        let kind = meta.file_type();
        !kind.is_symlink() && if directory { kind.is_dir() } else { kind.is_file() }
    })
}

fn read_pid(path: &Path) -> Option<u32> {
    let mut content = String::new();
    File::open(path).ok()?.take(MAX_PID_FILE_BYTES + 1).read_to_string(&mut content).ok()?;
    if content.len() as u64 > MAX_PID_FILE_BYTES {
        return None;
    }
    content.trim().parse().ok().filter(|pid| *pid > 0)
}

/// Live processes from the `*.pid` files directly inside `cwd/.run` and
/// `cwd/.runtime`. Parent directories are never searched.
pub fn scan_run_directory(cwd: &Path) -> Vec<RunProcessInfo> {
    let mut processes = Vec::new();
    let mut seen_names = BTreeSet::new();

    for dir_name in RUN_DIRS {
        let run_dir = cwd.join(dir_name);
        if !is_real(&run_dir, true) {
            continue;
        }
        let Ok(entries) = fs::read_dir(&run_dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_suffix(".pid"))
                .filter(|n| !n.is_empty())
            else {
                continue;
            };
            if seen_names.contains(name) || !is_real(&path, false) {
                continue;
            }
            let Some(pid) = read_pid(&path) else { continue };
            if is_process_alive(pid) {
                seen_names.insert(name.to_string());
                processes.push(RunProcessInfo {
                    name: name.to_string(),
                    pid,
                    project_dir: cwd.to_string_lossy().into_owned(),
                });
            }
        }
    }

    processes.sort_by(|a, b| a.name.cmp(&b.name));
    processes
}

/// Scans the exact directories of the open splits: absolute, deduplicated
/// and capped, so the UI can never trigger an unbounded filesystem walk.
pub fn detect_run_processes_for_cwds(cwds: &[String]) -> Vec<RunProcessInfo> {
    let directories: BTreeSet<PathBuf> = cwds
        .iter()
        .take(MAX_CWDS)
        .map(|cwd| cwd.trim())
        .filter(|cwd| !cwd.is_empty() && cwd.len() <= MAX_PATH_BYTES)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .collect();
    directories.iter().flat_map(|directory| scan_run_directory(directory)).collect()
}

// Async so the filesystem scan runs off the main thread.
#[tauri::command]
pub async fn run_processes_detect(cwds: Vec<String>) -> Vec<RunProcessInfo> {
    detect_run_processes_for_cwds(&cwds)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::config::test_dir;

    fn project(label: &str) -> PathBuf {
        let dir = test_dir(&format!("run-proc-{label}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn cwd(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn detects_live_pids_in_the_split_directory_run_and_runtime() {
        let root = project("both");
        fs::create_dir_all(root.join(".run")).unwrap();
        fs::create_dir_all(root.join(".runtime")).unwrap();
        let my_pid = std::process::id();
        fs::write(root.join(".run/web.pid"), format!("{my_pid}\n")).unwrap();
        fs::write(root.join(".runtime/api.pid"), format!("{my_pid}\n")).unwrap();

        let processes = detect_run_processes_for_cwds(&[cwd(&root)]);
        let names: Vec<_> = processes.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["api", "web"]);
        assert!(processes.iter().all(|p| p.pid == my_pid && p.project_dir == cwd(&root)));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn does_not_search_parent_directories() {
        let root = project("no-ascend");
        fs::create_dir_all(root.join(".run")).unwrap();
        fs::write(root.join(".run/web.pid"), std::process::id().to_string()).unwrap();
        let sub = root.join("apps/desktop");
        fs::create_dir_all(&sub).unwrap();

        assert!(detect_run_processes_for_cwds(&[cwd(&sub)]).is_empty());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ignores_stale_invalid_oversized_and_symlinked_pid_files() {
        let root = project("filter");
        let run_dir = root.join(".run");
        fs::create_dir_all(&run_dir).unwrap();
        let my_pid = std::process::id();
        fs::write(run_dir.join("live.pid"), format!("{my_pid}\n")).unwrap();
        fs::write(run_dir.join("dead.pid"), "99999999\n").unwrap();
        fs::write(run_dir.join("garbage.pid"), "invalid_pid\n").unwrap();
        fs::write(run_dir.join("huge.pid"), format!("{my_pid}{}", " ".repeat(64))).unwrap();
        fs::write(run_dir.join("not_pid.txt"), format!("{my_pid}\n")).unwrap();
        fs::write(run_dir.join(".pid"), format!("{my_pid}\n")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(run_dir.join("live.pid"), run_dir.join("link.pid")).unwrap();

        let names: Vec<_> = scan_run_directory(&root).into_iter().map(|p| p.name).collect();
        assert_eq!(names, ["live"]);

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn ignores_a_run_directory_that_is_a_symlink() {
        let root = project("symlink-dir");
        let elsewhere = project("symlink-target");
        fs::write(elsewhere.join("web.pid"), std::process::id().to_string()).unwrap();
        std::os::unix::fs::symlink(&elsewhere, root.join(".run")).unwrap();

        assert!(scan_run_directory(&root).is_empty());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(elsewhere).unwrap();
    }

    #[test]
    fn deduplicates_and_skips_relative_empty_and_excess_paths() {
        let root = project("dedup");
        fs::create_dir_all(root.join(".run")).unwrap();
        fs::write(root.join(".run/server.pid"), std::process::id().to_string()).unwrap();

        let results = detect_run_processes_for_cwds(&[
            cwd(&root),
            format!("  {}  ", cwd(&root)),
            "relative/dir".into(),
            String::new(),
        ]);
        assert_eq!(results.len(), 1);

        let mut excess = vec!["/".to_string(); MAX_CWDS];
        excess.push(cwd(&root));
        assert!(detect_run_processes_for_cwds(&excess).is_empty());

        fs::remove_dir_all(root).unwrap();
    }
}
