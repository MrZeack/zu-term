use tauri::{Emitter, Manager};

mod config;
mod dock;
mod host;
mod pty;
mod run_processes;
mod workspace_lock;
mod workspace_store;

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
            app.manage(workspace_store::ConfigStore::new(&paths));
            app.manage(paths);
            dock::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::config_read,
            workspace_store::config_import,
            workspace_store::settings_save,
            workspace_store::workspace_save,
            workspace_store::workspace_delete,
            workspace_lock::workspace_lock_acquire,
            workspace_lock::workspace_lock_release,
            workspace_lock::workspace_lock_release_all,
            host::local_hostname,
            host::initial_cwd,
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
            run_processes::run_processes_detect,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let windows = app_handle.webview_windows();
                if !windows.is_empty() {
                    api.prevent_exit();
                    let _ = app_handle.emit("zu-term://request-close", ());
                    for window in windows.values() {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
