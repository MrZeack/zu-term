use portable_pty::CommandBuilder;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{State, WebviewWindow};

use super::options::resolve_cwd;
use super::registry::{PtyEvent, PtyRegistry};
#[cfg(unix)]
use super::shell_integration;
use crate::config::{AppPaths, history_file};

/// The user's login shell, started in `cwd`, with the bundled zsh integration
/// (shell/osc7.zsh). `ZU_TERM_TERMINAL` tells shells they run here.
fn shell_command(
    paths: &AppPaths,
    cwd: Option<&str>,
    history_id: Option<&str>,
) -> Result<CommandBuilder, String> {
    let mut command = CommandBuilder::new_default_prog();
    #[cfg(unix)]
    {
        let shell = command.get_shell();
        shell_integration::apply(&mut command, &shell, &paths.config)?;
    }
    command.cwd(resolve_cwd(cwd, &paths.home));
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "zu-term");
    command.env("ZU_TERM_TERMINAL", "1");
    if let Some(history_path) = history_file(&paths.config, history_id)? {
        let history_path = history_path.to_string_lossy().into_owned();
        command.env("HISTFILE", &history_path);
        command.env("ZU_TERM_HISTORY_FILE", history_path);
    }
    Ok(command)
}

// Sessions are bound to the calling window's label, never to a client value.
// Tauri injects window and state as arguments, hence the long signature.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn pty_spawn(
    window: WebviewWindow,
    registry: State<'_, PtyRegistry>,
    paths: State<'_, AppPaths>,
    cwd: Option<String>,
    history_id: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u32, String> {
    registry.spawn(
        window.label(),
        shell_command(&paths, cwd.as_deref(), history_id.as_deref())?,
        cols,
        rows,
        move |event| {
            // Output goes as an ArrayBuffer (no JSON escaping); exit as JSON.
            let _ = on_event.send(match event {
                PtyEvent::Output(bytes) => InvokeResponseBody::Raw(bytes),
                PtyEvent::Exit(code) => {
                    InvokeResponseBody::Json(serde_json::json!({ "exit": code }).to_string())
                }
            });
        },
    )
}

#[tauri::command]
pub fn pty_write(
    window: WebviewWindow,
    registry: State<'_, PtyRegistry>,
    id: u32,
    data: String,
) -> Result<(), String> {
    registry.write(window.label(), id, &data)
}

#[tauri::command]
pub fn pty_resize(
    window: WebviewWindow,
    registry: State<'_, PtyRegistry>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.resize(window.label(), id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(window: WebviewWindow, registry: State<'_, PtyRegistry>, id: u32) {
    registry.kill(window.label(), id);
}
