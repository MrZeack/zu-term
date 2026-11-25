use std::collections::BTreeSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSummary {
    pub added: usize,
    pub modified: usize,
    pub deleted: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub cwd: String,
    pub branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<GitStatusSummary>,
}

/// Uncommitted changes of a repository: staged and unstaged against `HEAD`
/// as a unified diff (capped), plus untracked file names.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub diff: String,
    pub truncated: bool,
    pub untracked: Vec<String>,
}

pub const MAX_CWDS: usize = 64;
const MAX_PATH_BYTES: usize = 4096;
const MAX_GIT_FILE_BYTES: u64 = 1024;
const MAX_HEAD_BYTES: u64 = 512;
const MAX_BRANCH_NAME_BYTES: usize = 120;
const MAX_GIT_STATUS_BYTES: usize = 512 * 1024;
const GIT_STATUS_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_GIT_DIFF_BYTES: usize = 2 * 1024 * 1024;
const GIT_DIFF_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_UNTRACKED_FILES: usize = 500;
const POLL_INTERVAL: Duration = Duration::from_millis(15);

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

/// Parses standard `git status --porcelain=v1` output lines into counts of
/// added/untracked (+), modified/renamed (~) and deleted (-) files.
pub fn parse_git_status(output: &str) -> GitStatusSummary {
    let mut added = 0;
    let mut modified = 0;
    let mut deleted = 0;

    for line in output.lines() {
        let line = line.trim_end();
        if line.len() < 3 {
            continue;
        }
        let bytes = line.as_bytes();
        let x = bytes[0] as char;
        let y = bytes[1] as char;

        if (x == '?' && y == '?') || (x == 'A' && y != 'D') {
            added += 1;
        } else if x == 'D' || y == 'D' {
            deleted += 1;
        } else if x == 'M' || y == 'M' || x == 'R' || y == 'R' || x == 'U' || y == 'U' {
            modified += 1;
        }
    }

    GitStatusSummary { added, modified, deleted }
}

// Kills the command and anything it started: they share its process group.
fn kill_group(child: &mut std::process::Child) {
    #[cfg(unix)]
    if let Ok(pid) = libc::pid_t::try_from(child.id()) {
        // SAFETY: `kill` only sends a signal; `-pid` names the group that
        // `process_group(0)` created for this child.
        unsafe { libc::kill(-pid, libc::SIGKILL) };
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs `command` for at most `timeout` and returns its stdout when it
/// succeeds: the first `limit` bytes and whether there was more. The rest is
/// read and dropped so a long output never blocks the command.
fn run_command_capped(
    mut command: Command,
    timeout: Duration,
    limit: usize,
) -> Option<(Vec<u8>, bool)> {
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command.stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    // Drain stdout on a dedicated thread so a full pipe buffer never deadlocks
    // while waiting for exit; only `limit` bytes are kept.
    let reader = thread::spawn(move || {
        let mut kept = Vec::new();
        let mut truncated = false;
        let mut chunk = [0_u8; 16 * 1024];
        while let Ok(read) = stdout.read(&mut chunk) {
            if read == 0 {
                break;
            }
            let room = limit - kept.len();
            kept.extend_from_slice(&chunk[..read.min(room)]);
            truncated |= read > room;
        }
        (kept, truncated)
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            // Timed out or unknown state: the reader is left to end on its
            // own, since a surviving descendant could keep stdout open.
            _ => {
                kill_group(&mut child);
                return None;
            }
        }
    };
    if !status.success() {
        return None;
    }
    reader.join().ok()
}

fn run_command_with_timeout(command: Command, timeout: Duration) -> Option<String> {
    let (bytes, _) = run_command_capped(command, timeout, MAX_GIT_STATUS_BYTES)?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// Runs `git status --porcelain=v1` in the specified directory if git is available.
/// Uses `GIT_OPTIONAL_LOCKS=0` to ensure background checks never conflict with user
/// git commands or acquire background repository index locks.
pub fn detect_git_status(cwd: &Path) -> Option<GitStatusSummary> {
    let mut command = Command::new("git");
    command
        .arg("status")
        .arg("--porcelain=v1")
        .arg("--untracked-files=normal")
        .current_dir(cwd)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C");

    let text = run_command_with_timeout(command, GIT_STATUS_TIMEOUT)?;
    Some(parse_git_status(&text))
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
            let status = detect_git_status(path);
            results.push(GitBranchInfo { cwd: trimmed.to_string(), branch, status });
        }
    }
    results
}

/// git in `root` without running anything the repository configures: no
/// external diff or textconv tools and no fsmonitor hook.
fn safe_git(root: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command
        .args(["-c", "core.fsmonitor=false", "-c", "core.quotepath=off"])
        .args(args)
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C");
    command
}

const DIFF_ARGS: [&str; 5] = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M"];

fn diff_output(root: &Path, extra: &[&str], limit: usize) -> Result<(Vec<u8>, bool), String> {
    let args: Vec<&str> = DIFF_ARGS.iter().chain(extra).copied().collect();
    run_command_capped(safe_git(root, &args), GIT_DIFF_TIMEOUT, limit)
        .ok_or_else(|| "git diff no respondió".to_string())
}

pub fn git_diff_in(root: &Path) -> Result<GitDiff, String> {
    let has_head = run_command_capped(
        safe_git(root, &["rev-parse", "--verify", "-q", "HEAD"]),
        GIT_DIFF_TIMEOUT,
        64,
    )
    .is_some();
    let (mut bytes, mut truncated) = if has_head {
        diff_output(root, &["HEAD"], MAX_GIT_DIFF_BYTES)?
    } else {
        // Before the first commit: what is staged, then what is not.
        diff_output(root, &["--cached"], MAX_GIT_DIFF_BYTES)?
    };
    if !has_head && !truncated {
        let (rest, rest_truncated) = diff_output(root, &[], MAX_GIT_DIFF_BYTES - bytes.len())?;
        bytes.extend(rest);
        truncated = rest_truncated;
    }

    let untracked = run_command_capped(
        safe_git(root, &["ls-files", "--others", "--exclude-standard", "-z"]),
        GIT_DIFF_TIMEOUT,
        MAX_GIT_STATUS_BYTES,
    )
    .map(|(names, _)| {
        names
            .split(|byte| *byte == 0)
            .filter(|name| !name.is_empty())
            .take(MAX_UNTRACKED_FILES)
            .map(|name| String::from_utf8_lossy(name).into_owned())
            .collect()
    })
    .unwrap_or_default();

    Ok(GitDiff { diff: String::from_utf8_lossy(&bytes).into_owned(), truncated, untracked })
}

/// Same folders the branch badge accepts: an absolute path that directly
/// holds a repository.
pub fn git_diff_for(cwd: &str) -> Result<GitDiff, String> {
    let trimmed = cwd.trim();
    let path = Path::new(trimmed);
    if trimmed.is_empty() || trimmed.len() > MAX_PATH_BYTES || !path.is_absolute() {
        return Err("carpeta no válida".into());
    }
    if detect_git_branch(path).is_none() {
        return Err("la carpeta no es la raíz de un repositorio git".into());
    }
    git_diff_in(path)
}

#[tauri::command]
pub async fn git_diff(cwd: String) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || git_diff_for(&cwd))
        .await
        .map_err(|error| error.to_string())?
}

// Offload blocking filesystem/subprocess work onto Tokio's blocking pool.
#[tauri::command]
pub async fn git_branches_detect(cwds: Vec<String>) -> Vec<GitBranchInfo> {
    tauri::async_runtime::spawn_blocking(move || detect_git_branches_for_cwds(&cwds))
        .await
        .unwrap_or_default()
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

    #[test]
    fn parses_git_status_porcelain_lines() {
        let porcelain = "\
?? untracked.txt
A  staged_new.txt
AM staged_new_modified.txt
AD staged_new_deleted.txt
 M modified_worktree.txt
M  modified_index.txt
MM modified_both.txt
 D deleted_worktree.txt
D  deleted_index.txt
R  renamed.txt
UU conflict.txt
";
        let summary = parse_git_status(porcelain);
        assert_eq!(summary.added, 3); // untracked, staged_new, staged_new_modified
        assert_eq!(summary.modified, 5); // modified_worktree, modified_index, modified_both, renamed, conflict
        assert_eq!(summary.deleted, 3); // staged_new_deleted, deleted_worktree, deleted_index
    }

    #[test]
    fn parses_empty_git_status_as_zero_changes() {
        let summary = parse_git_status("");
        assert_eq!(summary, GitStatusSummary::default());
    }

    #[cfg(unix)]
    #[test]
    fn command_with_timeout_returns_none_when_command_hangs() {
        // `; :` keeps `sleep` a child (no exec) holding stdout open, as dash
        // does on Linux: the timeout must not wait for it.
        let mut slow = std::process::Command::new("/bin/sh");
        slow.args(["-c", "sleep 5; :"]);
        let start = std::time::Instant::now();
        let output = run_command_with_timeout(slow, std::time::Duration::from_millis(80));
        assert!(output.is_none(), "slow command should time out");
        assert!(start.elapsed() < std::time::Duration::from_secs(2));

        let mut fast = std::process::Command::new("/bin/sh");
        fast.args(["-c", "printf 'ok'"]);
        let ok = run_command_with_timeout(fast, std::time::Duration::from_secs(2));
        assert_eq!(ok.as_deref(), Some("ok"));
    }
    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
            .args(args)
            .current_dir(dir)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("git");
        assert!(status.success(), "git {args:?}");
    }

    fn repo(label: &str) -> PathBuf {
        let root = temp_test_dir(label);
        git(&root, &["init", "-q"]);
        root
    }

    #[test]
    fn diff_shows_changes_against_head_and_lists_untracked_files() {
        let root = repo("diff");
        fs::write(root.join("a.txt"), "old\n").unwrap();
        git(&root, &["add", "a.txt"]);
        git(&root, &["commit", "-qm", "init"]);
        fs::write(root.join("a.txt"), "new\n").unwrap();
        fs::write(root.join("staged.txt"), "staged\n").unwrap();
        git(&root, &["add", "staged.txt"]);
        fs::write(root.join("b.txt"), "untracked\n").unwrap();

        let diff = git_diff_in(&root).expect("diff");
        assert!(diff.diff.contains("-old"), "{}", diff.diff);
        assert!(diff.diff.contains("+new"));
        assert!(diff.diff.contains("+staged"), "staged changes are included");
        assert_eq!(diff.untracked, vec!["b.txt".to_string()]);
        assert!(!diff.truncated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn diff_works_before_the_first_commit() {
        let root = repo("diff-unborn");
        fs::write(root.join("a.txt"), "first\n").unwrap();
        git(&root, &["add", "a.txt"]);

        let diff = git_diff_in(&root).expect("diff");
        assert!(diff.diff.contains("+first"), "{}", diff.diff);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn diff_never_runs_tools_configured_by_the_repository() {
        let root = repo("diff-hostile");
        fs::write(root.join("a.txt"), "old\n").unwrap();
        git(&root, &["add", "a.txt"]);
        git(&root, &["commit", "-qm", "init"]);
        let marker = root.join("ran");
        let tool = format!("touch {}", marker.display());
        git(&root, &["config", "diff.external", &tool]);
        git(&root, &["config", "diff.hostile.textconv", &tool]);
        git(&root, &["config", "core.fsmonitor", &tool]);
        fs::write(root.join(".gitattributes"), "*.txt diff=hostile\n").unwrap();
        fs::write(root.join("a.txt"), "new\n").unwrap();

        let diff = git_diff_in(&root).expect("diff");
        assert!(diff.diff.contains("+new"));
        assert!(!marker.exists(), "a repository setting ran a command");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn diff_only_accepts_the_root_of_a_repository() {
        let root = repo("diff-root");
        let nested = root.join("sub");
        fs::create_dir_all(&nested).unwrap();

        assert!(git_diff_for("relative/path").is_err());
        assert!(git_diff_for(nested.to_str().unwrap()).is_err(), "like the branch badge");
        assert!(git_diff_for(root.to_str().unwrap()).is_ok());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capped_command_output_reports_truncation_without_timing_out() {
        let mut big = Command::new("sh");
        big.args(["-c", "head -c 200000 /dev/zero"]);
        let (bytes, truncated) =
            run_command_capped(big, Duration::from_secs(5), 100).expect("finishes");
        assert_eq!(bytes.len(), 100);
        assert!(truncated);
    }
}
