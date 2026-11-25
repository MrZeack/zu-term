// App commands listed here are denied unless a capability grants them.
const COMMANDS: &[&str] = &[
    "config_read",
    "config_import",
    "settings_save",
    "telemetry_block_set",
    "workspace_save",
    "workspace_delete",
    "workspace_lock_acquire",
    "workspace_lock_release",
    "workspace_lock_release_all",
    "local_hostname",
    "initial_cwd",
    "git_branches_detect",
    "open_link",
    "pty_spawn",
    "pty_write",
    "pty_resize",
    "pty_kill",
    "pty_has_foreground_process",
    "run_processes_detect",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
