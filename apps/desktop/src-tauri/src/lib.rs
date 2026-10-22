mod dock;
mod host;
mod pty;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyRegistry::default())
        .setup(|app| {
            dock::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
