use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunProcessInfo {
    pub name: String,
    pub pid: u32,
    pub project_dir: String,
}

pub const RUN_DIRS: &[&str] = &[".run", ".runtime"];

/// Ascends from `start` to find the nearest project directory containing a `.run` or `.runtime` directory.
/// Halts if a repository boundary (`.git`) is reached without a `.run` or `.runtime` folder.
pub fn find_project_root_with_run(start: &Path) -> Option<PathBuf> {
    let mut current =
        if start.is_file() { start.parent()?.to_path_buf() } else { start.to_path_buf() };

    loop {
        for dir_name in RUN_DIRS {
            let run_dir = current.join(dir_name);
            if run_dir.is_dir() {
                return Some(current);
            }
        }
        if current.join(".git").exists() {
            break;
        }
        if !current.pop() {
            break;
        }
    }
    None
}

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

/// Reads all `*.pid` files in `project_dir/.run` and `project_dir/.runtime` and returns information
/// for all processes that are currently active.
pub fn scan_run_directory(project_dir: &Path) -> Vec<RunProcessInfo> {
    let mut processes = Vec::new();
    let mut seen_names = HashSet::new();

    for dir_name in RUN_DIRS {
        let run_dir = project_dir.join(dir_name);
        let entries = match fs::read_dir(&run_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !file_name.ends_with(".pid") {
                continue;
            }
            let Some(name) = file_name.strip_suffix(".pid") else {
                continue;
            };
            if name.is_empty() || seen_names.contains(name) {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };

            let pid: u32 = match content.trim().parse() {
                Ok(pid) if pid > 0 => pid,
                _ => continue,
            };

            if is_process_alive(pid) {
                seen_names.insert(name.to_string());
                processes.push(RunProcessInfo {
                    name: name.to_string(),
                    pid,
                    project_dir: project_dir.to_string_lossy().into_owned(),
                });
            }
        }
    }

    processes.sort_by(|a, b| a.name.cmp(&b.name));
    processes
}

/// Scans `.run` processes for each directory in `cwds`, deduplicating by project root.
pub fn detect_run_processes_for_cwds(cwds: &[String]) -> Vec<RunProcessInfo> {
    let mut project_roots = HashSet::new();

    for cwd_str in cwds {
        let trimmed = cwd_str.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        if let Some(root) = find_project_root_with_run(&path) {
            project_roots.insert(root);
        }
    }

    let mut all_processes = Vec::new();
    for root in project_roots {
        all_processes.extend(scan_run_directory(&root));
    }

    all_processes.sort_by(|a, b| {
        a.project_dir
            .cmp(&b.project_dir)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.pid.cmp(&b.pid))
    });

    all_processes
}

#[tauri::command]
pub fn run_processes_detect(cwds: Vec<String>) -> Vec<RunProcessInfo> {
    detect_run_processes_for_cwds(&cwds)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    fn temp_test_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zu-term-run-proc-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn finds_project_root_from_current_or_subdirs() {
        let root = temp_test_dir("finds-root");
        let run_dir = root.join(".run");
        fs::create_dir_all(&run_dir).unwrap();

        let sub = root.join("apps").join("desktop");
        fs::create_dir_all(&sub).unwrap();

        assert_eq!(find_project_root_with_run(&sub), Some(root.clone()));
        assert_eq!(find_project_root_with_run(&root), Some(root.clone()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn finds_project_root_with_runtime_dir() {
        let root = temp_test_dir("finds-runtime");
        let runtime_dir = root.join(".runtime");
        fs::create_dir_all(&runtime_dir).unwrap();

        let sub = root.join("apps").join("api");
        fs::create_dir_all(&sub).unwrap();

        assert_eq!(find_project_root_with_run(&sub), Some(root.clone()));
        assert_eq!(find_project_root_with_run(&root), Some(root.clone()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ignores_dirs_without_run_dir() {
        let root = temp_test_dir("no-run");
        assert_eq!(find_project_root_with_run(&root), None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stops_at_git_boundary() {
        let root = temp_test_dir("git-boundary");
        let git_dir = root.join(".git");
        fs::create_dir_all(&git_dir).unwrap();

        let sub = root.join("packages").join("shared");
        fs::create_dir_all(&sub).unwrap();

        assert_eq!(find_project_root_with_run(&sub), None);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scans_run_directory_filtering_stale_and_invalid_pids() {
        let root = temp_test_dir("scan-run");
        let run_dir = root.join(".run");
        fs::create_dir_all(&run_dir).unwrap();

        let my_pid = std::process::id();
        fs::write(run_dir.join("desktop.pid"), format!("{my_pid}\n")).unwrap();
        fs::write(run_dir.join("dead.pid"), "99999999\n").unwrap();
        fs::write(run_dir.join("garbage.pid"), "invalid_pid\n").unwrap();
        fs::write(run_dir.join("not_pid.txt"), "123\n").unwrap();
        fs::write(run_dir.join(".pid"), "123\n").unwrap();

        let processes = scan_run_directory(&root);
        assert_eq!(processes.len(), 1);
        assert_eq!(processes[0].name, "desktop");
        assert_eq!(processes[0].pid, my_pid);
        assert_eq!(processes[0].project_dir, root.to_string_lossy());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scans_runtime_directory_and_run_directory() {
        let root = temp_test_dir("scan-runtime");
        let runtime_dir = root.join(".runtime");
        fs::create_dir_all(&runtime_dir).unwrap();

        let my_pid = std::process::id();
        fs::write(runtime_dir.join("api.pid"), format!("{my_pid}\n")).unwrap();

        let processes = scan_run_directory(&root);
        assert_eq!(processes.len(), 1);
        assert_eq!(processes[0].name, "api");
        assert_eq!(processes[0].pid, my_pid);
        assert_eq!(processes[0].project_dir, root.to_string_lossy());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detects_and_deduplicates_for_multiple_cwds() {
        let root = temp_test_dir("dedup");
        let run_dir = root.join(".run");
        fs::create_dir_all(&run_dir).unwrap();

        let my_pid = std::process::id();
        fs::write(run_dir.join("server.pid"), format!("{my_pid}\n")).unwrap();

        let sub1 = root.join("src");
        let sub2 = root.join("tests");
        fs::create_dir_all(&sub1).unwrap();
        fs::create_dir_all(&sub2).unwrap();

        let cwds = vec![
            sub1.to_string_lossy().to_string(),
            sub2.to_string_lossy().to_string(),
            root.to_string_lossy().to_string(),
        ];

        let results = detect_run_processes_for_cwds(&cwds);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "server");
        assert_eq!(results[0].pid, my_pid);

        let _ = fs::remove_dir_all(root);
    }
}
