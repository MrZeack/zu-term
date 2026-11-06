use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::State;

use crate::config::AppPaths;
use crate::host::local_hostname;

/// What Ctrl+click on a terminal link does.
#[derive(Debug, PartialEq)]
pub enum LinkTarget {
    /// An http(s) URL, opened in the default browser.
    Url(String),
    /// An existing file or folder, opened with its default app.
    Open(PathBuf),
    /// An existing item that could run code if opened (executables, app
    /// bundles, installers, scripts): only shown in the file manager.
    Reveal(PathBuf),
}

const MAX_LINK_BYTES: usize = 4096;
/// Extensions that run code or install something when opened, on macOS
/// (bundles, scripts, installers) and Linux (launchers, scripts).
const RUNNABLE_EXTENSIONS: &[&str] = &[
    "action",
    "app",
    "appimage",
    "applescript",
    "bash",
    "command",
    "desktop",
    "jar",
    "kext",
    "mpkg",
    "osax",
    "pkg",
    "prefpane",
    "run",
    "scpt",
    "scptd",
    "sh",
    "terminal",
    "tool",
    "workflow",
    "zsh",
];

/// Resolves the text of a link printed in a pane whose folder is `cwd`.
/// Returns `None` for anything that is not an http(s) URL or an existing path.
pub fn resolve_link(
    target: &str,
    cwd: Option<&Path>,
    home: &Path,
    local_host: &str,
) -> Option<LinkTarget> {
    if target.is_empty() || target.len() > MAX_LINK_BYTES || target.chars().any(char::is_control) {
        return None;
    }
    if target.starts_with("https://") || target.starts_with("http://") {
        return (!target.contains(char::is_whitespace)).then(|| LinkTarget::Url(target.into()));
    }
    let path = match target.strip_prefix("file://") {
        Some(rest) => file_url_path(rest, local_host)?,
        None => resolve_path(strip_position(target), cwd, home)?,
    };
    let path = path.canonicalize().ok()?;
    Some(if runs_code(&path) { LinkTarget::Reveal(path) } else { LinkTarget::Open(path) })
}

/// `src/main.rs:12:3` → `src/main.rs`, as compilers and agents print them.
fn strip_position(target: &str) -> &str {
    let mut path = target;
    for _ in 0..2 {
        match path.rsplit_once(':') {
            Some((rest, number))
                if !number.is_empty() && number.bytes().all(|b| b.is_ascii_digit()) =>
            {
                path = rest;
            }
            _ => break,
        }
    }
    path
}

fn resolve_path(text: &str, cwd: Option<&Path>, home: &Path) -> Option<PathBuf> {
    if let Some(rest) = text.strip_prefix("~/") {
        return Some(home.join(rest));
    }
    let path = Path::new(text);
    if path.is_absolute() {
        return Some(path.to_path_buf());
    }
    cwd.filter(|cwd| cwd.is_absolute()).map(|cwd| cwd.join(path))
}

fn normalize_host(host: &str) -> String {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    host.strip_suffix(".local").map(str::to_owned).unwrap_or(host)
}

/// `host/path` of a `file://` URL, only for this machine (as with OSC 7).
fn file_url_path(rest: &str, local_host: &str) -> Option<PathBuf> {
    let slash = rest.find('/')?;
    let host = &rest[..slash];
    if !host.is_empty() && host != "localhost" && normalize_host(host) != normalize_host(local_host)
    {
        return None;
    }
    percent_decode(&rest[slash..]).map(PathBuf::from)
}

fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            decoded.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn runs_code(path: &Path) -> bool {
    let runnable_extension =
        path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| {
            RUNNABLE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        });
    // A folder with an extension is a bundle (`.app`, `.prefPane`...).
    runnable_extension || (path.is_dir() && path.extension().is_some()) || is_executable_file(path)
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata().is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable_file(_path: &Path) -> bool {
    false
}

#[cfg(target_os = "macos")]
fn launcher(target: &LinkTarget) -> Command {
    // Absolute path: a PATH entry must not replace the system launcher.
    let mut command = Command::new("/usr/bin/open");
    match target {
        LinkTarget::Url(url) => command.arg(url),
        LinkTarget::Open(path) => command.arg(path),
        LinkTarget::Reveal(path) => command.arg("-R").arg(path),
    };
    command
}

#[cfg(not(target_os = "macos"))]
fn launcher(target: &LinkTarget) -> Command {
    let mut command = Command::new("xdg-open");
    match target {
        LinkTarget::Url(url) => command.arg(url),
        LinkTarget::Open(path) => command.arg(path),
        // No portable "reveal": open the folder that contains it.
        LinkTarget::Reveal(path) => command.arg(path.parent().unwrap_or(path)),
    };
    command
}

/// Hands the link to the system launcher, without a shell.
fn launch(target: &LinkTarget) -> std::io::Result<()> {
    let mut child = launcher(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    // Reaped in the background so it does not linger as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Opens a link Ctrl+clicked in a pane. `Ok(false)` means the text is not
/// an http(s) URL or an existing path, e.g. a word that only looked like one.
#[tauri::command]
pub async fn open_link(
    paths: State<'_, AppPaths>,
    target: String,
    cwd: Option<String>,
) -> Result<bool, String> {
    let Some(link) =
        resolve_link(&target, cwd.as_deref().map(Path::new), &paths.home, &local_hostname())
    else {
        return Ok(false);
    };
    launch(&link).map_err(|error| format!("no se pudo abrir el enlace: {error}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::test_dir;
    use std::fs;

    const HOST: &str = "mac";

    fn fixture(name: &str) -> PathBuf {
        let directory = test_dir(name);
        fs::create_dir_all(directory.join("src")).expect("dir");
        fs::write(directory.join("src/main.rs"), "fn main() {}").expect("file");
        fs::write(directory.join("my notes.md"), "").expect("file");
        directory.canonicalize().expect("canonical")
    }

    fn open(path: PathBuf) -> Option<LinkTarget> {
        Some(LinkTarget::Open(path))
    }

    #[test]
    fn accepts_only_http_urls_without_spaces_or_control_characters() {
        let home = Path::new("/");
        let url = |text: &str| resolve_link(text, None, home, HOST);
        assert_eq!(
            url("https://example.com/a?b=1"),
            Some(LinkTarget::Url("https://example.com/a?b=1".into()))
        );
        assert_eq!(
            url("http://localhost:3000"),
            Some(LinkTarget::Url("http://localhost:3000".into()))
        );
        assert_eq!(url("javascript:alert(1)"), None);
        assert_eq!(url("ftp://example.com/file"), None);
        assert_eq!(url("https://exa mple.com"), None);
        assert_eq!(url("https://example.com/\u{1b}]"), None);
        assert_eq!(url(&format!("https://example.com/{}", "a".repeat(5000))), None);
    }

    #[test]
    fn resolves_existing_paths_from_the_pane_folder_home_or_absolute() {
        let directory = fixture("links-paths");
        let main = directory.join("src/main.rs");
        let cwd = Some(directory.as_path());
        let resolve = |text: &str| resolve_link(text, cwd, &directory, HOST);

        assert_eq!(resolve("src/main.rs"), open(main.clone()));
        assert_eq!(resolve("./src/main.rs:12:3"), open(main.clone()));
        assert_eq!(resolve("src/../src/main.rs:12"), open(main.clone()));
        assert_eq!(resolve("~/src/main.rs"), open(main.clone()));
        assert_eq!(resolve(main.to_str().expect("utf-8")), open(main.clone()));
        assert_eq!(resolve("src"), open(directory.join("src")));
        assert_eq!(resolve("missing.rs"), None);
        assert_eq!(resolve_link("src/main.rs", None, &directory, HOST), None);
        assert_eq!(resolve_link("src/main.rs", Some(Path::new("src")), &directory, HOST), None);

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn resolves_file_urls_only_for_this_host() {
        let directory = fixture("links-file-url");
        let notes = directory.join("my notes.md");
        let encoded = format!("{}/my%20notes.md", directory.display());
        let resolve = |text: &str| resolve_link(text, None, &directory, HOST);

        assert_eq!(resolve(&format!("file://{encoded}")), open(notes.clone()));
        assert_eq!(resolve(&format!("file://localhost{encoded}")), open(notes.clone()));
        assert_eq!(resolve(&format!("file://MAC.local{encoded}")), open(notes.clone()));
        assert_eq!(resolve(&format!("file://other{encoded}")), None);

        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn only_reveals_items_that_could_run_code_when_opened() {
        use std::os::unix::fs::PermissionsExt;

        let directory = fixture("links-reveal");
        let script = directory.join("deploy");
        fs::write(&script, "#!/bin/sh\n").expect("file");
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).expect("chmod");
        fs::create_dir(directory.join("Tool.app")).expect("bundle");
        fs::write(directory.join("run.command"), "").expect("file");
        fs::write(directory.join("setup.pkg"), "").expect("file");
        let resolve = |text: &str| resolve_link(text, Some(&directory), &directory, HOST);

        assert_eq!(resolve("deploy"), Some(LinkTarget::Reveal(script)));
        assert_eq!(resolve("Tool.app"), Some(LinkTarget::Reveal(directory.join("Tool.app"))));
        assert_eq!(resolve("run.command"), Some(LinkTarget::Reveal(directory.join("run.command"))));
        assert_eq!(resolve("setup.pkg"), Some(LinkTarget::Reveal(directory.join("setup.pkg"))));
        assert_eq!(resolve("src/main.rs"), open(directory.join("src/main.rs")));

        fs::remove_dir_all(directory).expect("cleanup");
    }
}
