use tauri::Manager;

mod config;
mod dock;
mod host;
mod pty;
mod workspace_lock;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyRegistry::default())
        .on_window_event(|window, event| {
            if !matches!(event, tauri::WindowEvent::Destroyed) {
                return;
            }
            window.state::<pty::PtyRegistry>().kill_owned_by(window.label());
            if let Err(error) =
                window.state::<workspace_lock::WorkspaceLocks>().release_all(window.label())
            {
                eprintln!("No se pudieron liberar los locks de workspace: {error}");
            }
        })
        .setup(|app| {
            let paths = config::AppPaths::from_home(app.path().home_dir()?);
            app.manage(workspace_lock::WorkspaceLocks::new(&paths));
            app.manage(paths);
            dock::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::config_read,
            config::config_write,
            workspace_lock::workspace_lock_acquire,
            workspace_lock::workspace_lock_release,
            workspace_lock::workspace_lock_release_all,
            host::local_hostname,
            host::initial_cwd,
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
