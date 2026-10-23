#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;
    use std::sync::OnceLock;
    use std::sync::atomic::{AtomicPtr, AtomicUsize, Ordering};

    use objc2::MainThreadOnly;
    use objc2::ffi::class_addMethod;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, ProtocolObject, Sel};
    use objc2::sel;
    use objc2_app_kit::{NSApplication, NSApplicationDelegate, NSMenu, NSMenuItem};
    use objc2_foundation::{MainThreadMarker, ns_string};

    static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
    static DOCK_MENU: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);

    const DOCK_MENU_TYPES: &[u8] = b"@@:@\0";
    const MENU_ACTION_TYPES: &[u8] = b"v@:@\0";

    extern "C-unwind" fn application_dock_menu(
        _delegate: &AnyObject,
        _selector: Sel,
        _application: &NSApplication,
    ) -> *mut NSMenu {
        DOCK_MENU.load(Ordering::Acquire).cast::<NSMenu>()
    }

    extern "C-unwind" fn open_new_window(
        _delegate: &AnyObject,
        _selector: Sel,
        _sender: &AnyObject,
    ) {
        let Some(app) = APP_HANDLE.get() else {
            return;
        };
        let number = NEXT_WINDOW.fetch_add(1, Ordering::Relaxed);
        let label = format!("zu-term-window-{number}");
        let result = tauri::WebviewWindowBuilder::new(
            app,
            label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Zu Term")
        .inner_size(1280.0, 800.0)
        .min_inner_size(480.0, 320.0)
        .build();
        if let Err(error) = result {
            eprintln!("No se pudo abrir una ventana nueva desde el Dock: {error}");
        }
    }

    pub fn install(app: &tauri::AppHandle) {
        let _ = APP_HANDLE.set(app.clone());
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("El menú del Dock debe instalarse en el hilo principal de macOS");
            return;
        };
        let application = NSApplication::sharedApplication(mtm);
        let Some(delegate) = application.delegate() else {
            eprintln!("No se encontró el delegado de AppKit para instalar el menú del Dock");
            return;
        };

        let menu = NSMenu::new(mtm);
        menu.setAutoenablesItems(false);
        let item = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                ns_string!("Nueva ventana"),
                Some(sel!(zuTermOpenNewWindow:)),
                ns_string!(""),
            )
        };
        let protocol_delegate: &ProtocolObject<dyn NSApplicationDelegate> = &delegate;
        let delegate_object: &AnyObject = protocol_delegate.as_ref();
        unsafe { item.setTarget(Some(delegate_object)) };
        menu.addItem(&item);

        // AppKit keeps the delegate weakly. The menu is intentionally retained
        // for the process lifetime because the delegate method can be called at
        // any time while the application is running.
        let menu_raw = Retained::into_raw(menu);
        DOCK_MENU.store(menu_raw.cast(), Ordering::Release);

        // Tauri has no Dock menu API, so the methods are added to the
        // delegate class that tao creates. This depends on tao's private
        // delegate: re-check the Dock menu manually after upgrading Tauri.
        let class = delegate_object.class() as *const _ as *mut _;
        let dock_menu_fn: extern "C-unwind" fn(&AnyObject, Sel, &NSApplication) -> *mut NSMenu =
            application_dock_menu;
        let new_window_fn: extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) = open_new_window;
        let dock_menu_imp: objc2::runtime::Imp = unsafe { std::mem::transmute(dock_menu_fn) };
        let new_window_imp: objc2::runtime::Imp = unsafe { std::mem::transmute(new_window_fn) };
        unsafe {
            class_addMethod(
                class,
                sel!(applicationDockMenu:),
                dock_menu_imp,
                DOCK_MENU_TYPES.as_ptr().cast(),
            );
            class_addMethod(
                class,
                sel!(zuTermOpenNewWindow:),
                new_window_imp,
                MENU_ACTION_TYPES.as_ptr().cast(),
            );
        }
    }
}

#[cfg(target_os = "macos")]
pub fn install(app: &tauri::AppHandle) {
    macos::install(app);
}

#[cfg(not(target_os = "macos"))]
pub fn install<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}
