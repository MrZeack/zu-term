use std::collections::BTreeSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub cwd: String,
    pub branch: String,
}

pub const MAX_CWDS: usize = 64;
const MAX_PATH_BYTES: usize = 4096;
const MAX_GIT_FILE_BYTES: u64 = 1024;
const MAX_HEAD_BYTES: u64 = 512;
const MAX_BRANCH_NAME_BYTES: usize = 120;

fn read_text_file(path: &Path, limit: u64) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut buffer = String::new();
    file.take(limit + 1).read_to_string(&mut buffer).ok()?;
    if buffer.len() as u64 > limit {
        return None;
    }
    Some(buffer)
}

/// Detects the git branch of a directory if and only if that directory
/// directly contains a git repository (`.git` directory or file).
/// Parent directories are NEVER searched.
pub fn detect_git_branch(cwd: &Path) -> Option<String> {
    let git_path = cwd.join(".git");
    let git_dir = if git_path.is_dir() {
        git_path
    } else if git_path.is_file() {
        // Git worktree or submodule: "gitdir: <path>"
        let content = read_text_file(&git_path, MAX_GIT_FILE_BYTES)?;
        let gitdir_line =
            content.lines().find_map(|line| line.trim().strip_prefix("gitdir:")).map(str::trim)?;
        if gitdir_line.is_empty() {
            return None;
        }
        let gitdir_path = Path::new(gitdir_line);
        if gitdir_path.is_absolute() { gitdir_path.to_path_buf() } else { cwd.join(gitdir_path) }
    } else {
        return None;
    };

    let head_path = git_dir.join("HEAD");
    let head_content = read_text_file(&head_path, MAX_HEAD_BYTES)?;
    let trimmed = head_content.trim();

    if let Some(branch) = trimmed.strip_prefix("ref: refs/heads/") {
        let branch = branch.trim();
        if !branch.is_empty() && branch.len() <= MAX_BRANCH_NAME_BYTES {
            return Some(branch.to_string());
        }
    } else if let Some(ref_name) = trimmed.strip_prefix("ref: ") {
        let ref_name = ref_name.trim();
        if !ref_name.is_empty() && ref_name.len() <= MAX_BRANCH_NAME_BYTES {
            return Some(ref_name.to_string());
        }
    } else if trimmed.len() >= 7 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(trimmed[..7.min(trimmed.len())].to_string());
    }

    None
}

/// Scans the exact directories of the open splits: absolute, deduplicated
/// and capped, so the UI can never trigger an unbounded filesystem walk.
pub fn detect_git_branches_for_cwds(cwds: &[String]) -> Vec<GitBranchInfo> {
    let mut seen = BTreeSet::new();
    let mut results = Vec::new();

    for raw in cwds.iter().take(MAX_CWDS) {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.len() > MAX_PATH_BYTES {
            continue;
        }
        let path = Path::new(trimmed);
        if !path.is_absolute() {
            continue;
        }
        if !seen.insert(trimmed.to_string()) {
            continue;
        }
        if let Some(branch) = detect_git_branch(path) {
            results.push(GitBranchInfo { cwd: trimmed.to_string(), branch });
        }
    }
    results
}

// Async so the filesystem scan runs off the main thread.
#[tauri::command]
pub async fn git_branches_detect(cwds: Vec<String>) -> Vec<GitBranchInfo> {
    detect_git_branches_for_cwds(&cwds)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;
    use crate::config::test_dir;

    fn temp_test_dir(label: &str) -> PathBuf {
        let dir = test_dir(&format!("git-test-{label}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn detects_standard_git_branch_from_head_ref() {
        let root = temp_test_dir("standard");
        let git_dir = root.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();

        assert_eq!(detect_git_branch(&root), Some("main".to_string()));

        fs::write(git_dir.join("HEAD"), "ref: refs/heads/feature/split-git-info\n").unwrap();
        assert_eq!(detect_git_branch(&root), Some("feature/split-git-info".to_string()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detects_detached_head_commit_hash() {
        let root = temp_test_dir("detached");
        let git_dir = root.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("HEAD"), "6477113c52cf413c5d98516ca642237a8aac5e61\n").unwrap();

        assert_eq!(detect_git_branch(&root), Some("6477113".to_string()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detects_git_worktree_file_reference() {
        let root = temp_test_dir("worktree-root");
        let actual_git_dir = root.join("actual-git-dir");
        fs::create_dir_all(&actual_git_dir).unwrap();
        fs::write(actual_git_dir.join("HEAD"), "ref: refs/heads/worktree-branch\n").unwrap();

        let worktree_dir = root.join("worktree");
        fs::create_dir_all(&worktree_dir).unwrap();
        fs::write(worktree_dir.join(".git"), format!("gitdir: {}\n", actual_git_dir.display()))
            .unwrap();

        assert_eq!(detect_git_branch(&worktree_dir), Some("worktree-branch".to_string()));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn returns_none_for_directory_without_git() {
        let root = temp_test_dir("no-git");
        assert_eq!(detect_git_branch(&root), None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn never_searches_parent_directories_only_the_split_folder() {
        let parent = temp_test_dir("parent-git");
        let git_dir = parent.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/parent-branch\n").unwrap();

        let child = parent.join("subfolder");
        fs::create_dir_all(&child).unwrap();

        // El padre tiene git, pero child no tiene .git directo -> debe devolver None
        assert_eq!(detect_git_branch(&child), None);

        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn detects_branches_for_multiple_cwds_deduplicating_and_ignoring_invalid() {
        let root1 = temp_test_dir("multi-1");
        fs::create_dir_all(root1.join(".git")).unwrap();
        fs::write(root1.join(".git/HEAD"), "ref: refs/heads/alpha\n").unwrap();

        let root2 = temp_test_dir("multi-2");
        fs::create_dir_all(root2.join(".git")).unwrap();
        fs::write(root2.join(".git/HEAD"), "ref: refs/heads/beta\n").unwrap();

        let no_git = temp_test_dir("multi-no-git");

        let cwds = vec![
            root1.to_string_lossy().into_owned(),
            format!("  {}  ", root1.to_string_lossy()),
            root2.to_string_lossy().into_owned(),
            no_git.to_string_lossy().into_owned(),
            "relative/path".to_string(),
            "".to_string(),
        ];

        let results = detect_git_branches_for_cwds(&cwds);
        assert_eq!(results.len(), 2);
        assert!(results.iter().any(|r| r.cwd == root1.to_string_lossy() && r.branch == "alpha"));
        assert!(results.iter().any(|r| r.cwd == root2.to_string_lossy() && r.branch == "beta"));

        let _ = fs::remove_dir_all(root1);
        let _ = fs::remove_dir_all(root2);
        let _ = fs::remove_dir_all(no_git);
    }
}
