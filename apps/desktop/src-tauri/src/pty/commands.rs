use std::path::PathBuf;

use portable_pty::CommandBuilder;
use tauri::State;
use tauri::ipc::Channel;

use super::options::resolve_cwd;
use super::registry::{PtyEvent, PtyRegistry};

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// The user's login shell, started in `cwd`. `CONSOLE_TERMINAL` lets shell
/// integration (shell/osc7.zsh) know it runs here.
fn shell_command(cwd: Option<&str>) -> CommandBuilder {
    let mut command = CommandBuilder::new_default_prog();
    command.cwd(resolve_cwd(cwd, &home_dir()));
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "console");
    command.env("CONSOLE_TERMINAL", "1");
    command
}

#[tauri::command]
pub fn pty_spawn(
    registry: State<'_, PtyRegistry>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    registry.spawn(shell_command(cwd.as_deref()), cols, rows, move |event| {
        let _ = on_event.send(event);
    })
}

#[tauri::command]
pub fn pty_write(registry: State<'_, PtyRegistry>, id: u32, data: String) -> Result<(), String> {
    registry.write(id, &data)
}

#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.resize(id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(registry: State<'_, PtyRegistry>, id: u32) {
    registry.kill(id);
}
