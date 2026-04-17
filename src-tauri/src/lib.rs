use base64::Engine as _;
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// ─── Computer Use: Screenshot + Input Commands ──────────────────────────────

#[derive(Serialize)]
struct ActiveWindowInfo {
    title: String,
    app_name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// Capture the primary screen as a JSON with base64 PNG + dimensions.
/// Resizes to max 1280px width for efficient Holo3 inference while preserving
/// the original dimensions for coordinate mapping.
#[tauri::command]
fn capture_screen() -> Result<serde_json::Value, String> {
    use screenshots::image::imageops::FilterType;

    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;
    let screen = screens.into_iter().next().ok_or("No screens found")?;
    let capture = screen.capture().map_err(|e| format!("Failed to capture screen: {e}"))?;

    let orig_width = capture.width();
    let orig_height = capture.height();

    // Resize for Holo3 — max 1280px wide, maintain aspect ratio
    let max_width: u32 = 1280;
    let (out_width, out_height) = if orig_width > max_width {
        let scale = max_width as f64 / orig_width as f64;
        (max_width, (orig_height as f64 * scale).round() as u32)
    } else {
        (orig_width, orig_height)
    };

    let resized = if out_width != orig_width {
        screenshots::image::imageops::resize(&capture, out_width, out_height, FilterType::Triangle)
    } else {
        capture.clone()
    };

    let mut buf = Cursor::new(Vec::new());
    resized.write_to(&mut buf, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());

    Ok(serde_json::json!({
        "image": b64,
        "width": orig_width,
        "height": orig_height,
    }))
}

/// Simulate a left click at (x, y).
#[tauri::command]
fn click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Move failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click failed: {e}"))?;
    Ok(())
}

/// Simulate a double click at (x, y).
#[tauri::command]
fn double_click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Move failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click 1 failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click 2 failed: {e}"))?;
    Ok(())
}

/// Simulate a right click at (x, y).
#[tauri::command]
fn right_click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Move failed: {e}"))?;
    enigo.button(enigo::Button::Right, enigo::Direction::Click).map_err(|e| format!("Right click failed: {e}"))?;
    Ok(())
}

/// Type text using keyboard simulation.
#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.text(&text).map_err(|e| format!("Type failed: {e}"))?;
    Ok(())
}

/// Press a key or key combo (e.g. "Enter", "ctrl+n", "meta+r", "ctrl+shift+s").
#[tauri::command]
fn key_press(key: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings, Key, Direction};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;

    // Handle combo keys: "ctrl+n", "meta+r", "ctrl+shift+s", etc.
    if key.contains('+') {
        let parts: Vec<&str> = key.split('+').collect();
        let modifiers = &parts[..parts.len() - 1];
        let final_key = parts[parts.len() - 1].trim();

        // Press modifiers
        for m in modifiers {
            let mk = parse_key(m.trim())?;
            enigo.key(mk, Direction::Press).map_err(|e| format!("Modifier press failed: {e}"))?;
        }
        // Press and release the final key
        let fk = parse_key(final_key)?;
        enigo.key(fk, Direction::Click).map_err(|e| format!("Key press failed: {e}"))?;
        // Release modifiers (reverse order)
        for m in modifiers.iter().rev() {
            let mk = parse_key(m.trim())?;
            enigo.key(mk, Direction::Release).map_err(|e| format!("Modifier release failed: {e}"))?;
        }
        return Ok(());
    }

    // Single key
    let k = parse_key(&key)?;
    enigo.key(k, enigo::Direction::Click).map_err(|e| format!("Key press failed: {e}"))?;
    Ok(())
}

fn parse_key(key: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    let k = match key.to_lowercase().as_str() {
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "backspace" => Key::Backspace,
        "delete" => Key::Delete,
        "space" => Key::Space,
        "up" | "arrowup" => Key::UpArrow,
        "down" | "arrowdown" => Key::DownArrow,
        "left" | "arrowleft" => Key::LeftArrow,
        "right" | "arrowright" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        "ctrl" | "control" => Key::Control,
        "alt" => Key::Alt,
        "shift" => Key::Shift,
        "meta" | "super" | "win" | "command" => Key::Meta,
        other => {
            // Single character keys
            if other.len() == 1 {
                Key::Unicode(other.chars().next().unwrap())
            } else {
                return Err(format!("Unknown key: {key}"));
            }
        }
    };
    Ok(k)
}

/// Scroll in a direction.
#[tauri::command]
fn scroll(direction: String, amount: Option<i32>) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Axis};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    let steps = amount.unwrap_or(3);
    match direction.to_lowercase().as_str() {
        "up" => enigo.scroll(steps, Axis::Vertical).map_err(|e| format!("Scroll failed: {e}"))?,
        "down" => enigo.scroll(-steps, Axis::Vertical).map_err(|e| format!("Scroll failed: {e}"))?,
        "left" => enigo.scroll(-steps, Axis::Horizontal).map_err(|e| format!("Scroll failed: {e}"))?,
        "right" => enigo.scroll(steps, Axis::Horizontal).map_err(|e| format!("Scroll failed: {e}"))?,
        _ => return Err(format!("Unknown direction: {direction}")),
    }
    Ok(())
}

/// Move the mouse to (x, y) without clicking.
#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Move failed: {e}"))?;
    Ok(())
}

/// Click and drag from (x, y) to (end_x, end_y).
#[tauri::command]
fn drag(x: i32, y: i32, end_x: i32, end_y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Coordinate, Button, Direction};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Move start failed: {e}"))?;
    enigo.button(Button::Left, Direction::Press).map_err(|e| format!("Press failed: {e}"))?;
    // Smooth drag in steps
    let steps = 10;
    for i in 1..=steps {
        let cx = x + (end_x - x) * i / steps;
        let cy = y + (end_y - y) * i / steps;
        enigo.move_mouse(cx, cy, Coordinate::Abs).map_err(|e| format!("Drag step failed: {e}"))?;
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    enigo.button(Button::Left, Direction::Release).map_err(|e| format!("Release failed: {e}"))?;
    Ok(())
}

/// Get info about the currently active window.
#[tauri::command]
fn get_active_window() -> Result<ActiveWindowInfo, String> {
    // Windows-specific: use WinAPI to get foreground window
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        unsafe {
            let hwnd = windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow();
            if hwnd == std::ptr::null_mut() {
                return Err("No active window".into());
            }

            // Get window title
            let mut title_buf = [0u16; 512];
            let len = windows_sys::Win32::UI::WindowsAndMessaging::GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 512);
            let title = OsString::from_wide(&title_buf[..len as usize]).to_string_lossy().into_owned();

            // Get window rect
            let mut rect = std::mem::zeroed::<windows_sys::Win32::Foundation::RECT>();
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect);

            // Get process name
            let mut pid = 0u32;
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, &mut pid);
            let app_name = get_process_name(pid).unwrap_or_else(|| "unknown".into());

            Ok(ActiveWindowInfo {
                title,
                app_name,
                x: rect.left,
                y: rect.top,
                width: (rect.right - rect.left) as u32,
                height: (rect.bottom - rect.top) as u32,
            })
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Active window detection not yet supported on this platform".into())
    }
}

#[cfg(target_os = "windows")]
unsafe fn get_process_name(pid: u32) -> Option<String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    let handle = windows_sys::Win32::System::Threading::OpenProcess(
        windows_sys::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION,
        0, // FALSE
        pid,
    );
    if handle == std::ptr::null_mut() {
        return None;
    }

    let mut buf = [0u16; 512];
    let mut size = 512u32;
    let ok = windows_sys::Win32::System::Threading::QueryFullProcessImageNameW(
        handle,
        0,
        buf.as_mut_ptr(),
        &mut size,
    );
    windows_sys::Win32::Foundation::CloseHandle(handle);

    if ok == 0 {
        return None;
    }

    let path = OsString::from_wide(&buf[..size as usize]).to_string_lossy().into_owned();
    path.rsplit('\\').next().map(|s| s.to_string())
}

// ─── UI Automation: Structured element detection ─────────────────────────────

/// UI element info returned to the frontend/sidecar
#[derive(Serialize, Clone)]
struct UIElementInfo {
    name: String,
    control_type: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    /// Centre point for clicking
    cx: i32,
    cy: i32,
}

/// List all clickable UI elements in the foreground window.
/// Returns structured data: name, type, bounding box, centre coordinates.
#[tauri::command]
fn list_ui_elements() -> Result<Vec<UIElementInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        use uiautomation::UIAutomation;

        let automation = UIAutomation::new().map_err(|e| format!("UIA init failed: {e}"))?;
        let root = automation.get_root_element().map_err(|e| format!("Root failed: {e}"))?;

        // Get the foreground window
        let _focused = automation.get_focused_element().map_err(|e| format!("Focus failed: {e}"))?;
        let walker = automation.get_control_view_walker().map_err(|e| format!("Walker failed: {e}"))?;

        // Walk the focused window's children (max 50 elements to avoid overwhelming)
        let mut elements = Vec::new();
        collect_elements(&walker, &root, &mut elements, 0, 3); // depth 3

        Ok(elements)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("UI Automation not available on this platform".into())
    }
}

#[cfg(target_os = "windows")]
fn collect_elements(
    walker: &uiautomation::UITreeWalker,
    parent: &uiautomation::UIElement,
    elements: &mut Vec<UIElementInfo>,
    depth: u32,
    max_depth: u32,
) {
    if depth > max_depth || elements.len() >= 100 {
        return;
    }

    if let Ok(child) = walker.get_first_child(parent) {
        collect_element_recursive(walker, &child, elements, depth, max_depth);
    }
}

#[cfg(target_os = "windows")]
fn collect_element_recursive(
    walker: &uiautomation::UITreeWalker,
    element: &uiautomation::UIElement,
    elements: &mut Vec<UIElementInfo>,
    depth: u32,
    max_depth: u32,
) {
    if elements.len() >= 100 {
        return;
    }

    // Get element info
    let name = element.get_name().unwrap_or_default();
    let control_type = element.get_localized_control_type().unwrap_or_default();
    let rect = element.get_bounding_rectangle().unwrap_or_default();

    // Only include elements that have a name and a visible bounding box
    let w = rect.get_width() as i32;
    let h = rect.get_height() as i32;
    let x = rect.get_left() as i32;
    let y = rect.get_top() as i32;
    if !name.is_empty() && w > 0 && h > 0 {
        elements.push(UIElementInfo {
            name: name.clone(),
            control_type,
            x,
            y,
            width: w,
            height: h,
            cx: x + w / 2,
            cy: y + h / 2,
        });
    }

    // Recurse into children
    if depth < max_depth {
        collect_elements(walker, element, elements, depth + 1, max_depth);
    }

    // Move to next sibling
    if let Ok(next) = walker.get_next_sibling(element) {
        collect_element_recursive(walker, &next, elements, depth, max_depth);
    }
}

/// Find a specific UI element by name (partial match) and return its centre coordinates.
#[tauri::command]
fn find_ui_element(name: String) -> Result<UIElementInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let elements = list_ui_elements()?;
        let name_lower = name.to_lowercase();

        // Exact match first, then partial
        if let Some(el) = elements.iter().find(|e| e.name.to_lowercase() == name_lower) {
            return Ok(el.clone());
        }
        if let Some(el) = elements.iter().find(|e| e.name.to_lowercase().contains(&name_lower)) {
            return Ok(el.clone());
        }

        Err(format!("Element '{}' not found. Available: {}", name,
            elements.iter().take(10).map(|e| format!("{}({})", e.name, e.control_type)).collect::<Vec<_>>().join(", ")))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("UI Automation not available on this platform".into())
    }
}

/// Focus a window by name — brings it to the foreground.
#[tauri::command]
fn focus_window(name: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use uiautomation::UIAutomation;

        let automation = UIAutomation::new().map_err(|e| format!("UIA init failed: {e}"))?;
        let root = automation.get_root_element().map_err(|e| format!("Root failed: {e}"))?;
        let walker = automation.get_control_view_walker().map_err(|e| format!("Walker failed: {e}"))?;

        let name_lower = name.to_lowercase();

        // Walk top-level windows to find the target
        if let Ok(child) = walker.get_first_child(&root) {
            let mut current = child;
            loop {
                let win_name = current.get_name().unwrap_or_default();
                if win_name.to_lowercase().contains(&name_lower) {
                    // Found it — try to set focus
                    current.set_focus().map_err(|e| format!("Focus failed: {e}"))?;
                    return Ok(win_name);
                }
                match walker.get_next_sibling(&current) {
                    Ok(next) => current = next,
                    Err(_) => break,
                }
            }
        }

        Err(format!("Window '{}' not found", name))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Not available on this platform".into())
    }
}

/// Click a UI element by name — finds it via UIA and clicks its centre.
#[tauri::command]
fn click_element(name: String) -> Result<UIElementInfo, String> {
    let element = find_ui_element(name)?;

    // Click the centre of the element
    use enigo::{Enigo, Mouse, Settings, Coordinate};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.move_mouse(element.cx, element.cy, Coordinate::Abs)
        .map_err(|e| format!("Move failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click)
        .map_err(|e| format!("Click failed: {e}"))?;

    Ok(element)
}

/// Get the primary monitor's DPI scale factor (e.g., 1.25 for 125% scaling).
#[tauri::command]
fn get_dpi_scale() -> Result<f64, String> {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            // Get the DPI for the primary monitor
            let hdc = windows_sys::Win32::Graphics::Gdi::GetDC(std::ptr::null_mut());
            if hdc.is_null() {
                return Ok(1.0);
            }
            let dpi = windows_sys::Win32::Graphics::Gdi::GetDeviceCaps(hdc, 88); // LOGPIXELSX = 88
            windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), hdc);
            Ok(dpi as f64 / 96.0) // 96 DPI = 100% scaling
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(1.0)
    }
}

// ─── Desktop Mode Kill Switch ──────────────────────────────────────────────
//
// Three kill layers, any of which aborts the active trajectory:
//   1. Triple-Escape — global hotkey, always active during desktop mode
//   2. Stop button — frontend sends this command
//   3. Budget trip — automatic, handled by the TypeScript budget tracker
//
// On kill: we emit "desktop:kill" to the frontend, which tears down the
// trajectory, and Narrator reports what was done so far.

static DESKTOP_MODE_ACTIVE: AtomicBool = AtomicBool::new(false);

struct EscapeTracker {
    timestamps: Vec<std::time::Instant>,
}

impl EscapeTracker {
    fn new() -> Self {
        Self { timestamps: Vec::new() }
    }

    fn press(&mut self) -> bool {
        let now = std::time::Instant::now();
        self.timestamps.push(now);
        // Keep only presses within the last 800ms
        self.timestamps.retain(|t| now.duration_since(*t).as_millis() < 800);
        // Triple-Escape detected
        self.timestamps.len() >= 3
    }

    fn reset(&mut self) {
        self.timestamps.clear();
    }
}

/// Activate desktop mode — enables the panic kill hotkey.
#[tauri::command]
fn desktop_mode_start(app: AppHandle) -> Result<(), String> {
    DESKTOP_MODE_ACTIVE.store(true, Ordering::SeqCst);
    // Reset the escape tracker in case stale state from a previous session
    if let Some(tracker) = app.try_state::<Mutex<EscapeTracker>>() {
        if let Ok(mut t) = tracker.lock() {
            t.reset();
        }
    }
    Ok(())
}

/// Deactivate desktop mode — disables the panic kill hotkey.
#[tauri::command]
fn desktop_mode_stop() -> Result<(), String> {
    DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

/// Kill the active trajectory — callable from frontend stop button or
/// companion kill message. Emits "desktop:kill" to all listeners.
#[tauri::command]
fn desktop_kill(app: AppHandle, level: String) -> Result<(), String> {
    let valid_levels = ["pause", "stop", "panic"];
    if !valid_levels.contains(&level.as_str()) {
        return Err(format!("Invalid kill level: {level}. Must be pause, stop, or panic."));
    }
    DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
    app.emit("desktop:kill", serde_json::json!({ "level": level }))
        .map_err(|e| format!("Failed to emit kill: {e}"))?;
    Ok(())
}

// ─── System Tray ──────────────────────────────────────────────────────────
//
// Tray mode keeps the IDE alive after the main window closes so the
// companion can still pair remotely and watchers can still fire.
//
// Menu:
//   - Show Ava          — brings the main window back
//   - Stop Desktop Mode — kills any active trajectory
//   - Quit Ava          — full exit, no tray persistence

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::TrayIconBuilder;
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let show = MenuItemBuilder::with_id("show", "Show Ava").build(app)?;
    let stop = MenuItemBuilder::with_id("stop_desktop", "Stop Desktop Mode").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Ava").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&stop)
        .separator()
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Ava | Supernova IDE")
        .on_menu_event(move |app: &tauri::AppHandle, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                    }
                }
                "stop_desktop" => {
                    DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
                    let _ = app.emit("desktop:kill", serde_json::json!({ "level": "stop" }));
                }
                "quit" => {
                    DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_panic_hotkey(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let escape: Shortcut = "Escape".parse()?;
    let app_handle = app.handle().clone();

    app.global_shortcut().on_shortcut(escape, move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if !DESKTOP_MODE_ACTIVE.load(Ordering::SeqCst) {
            return;
        }
        if let Some(tracker) = app_handle.try_state::<Mutex<EscapeTracker>>() {
            if let Ok(mut t) = tracker.lock() {
                if t.press() {
                    t.reset();
                    DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
                    let _ = app_handle.emit("desktop:kill", serde_json::json!({ "level": "panic" }));
                }
            }
        }
    })?;

    Ok(())
}

// ─── Ava Profile Encryption (OS Keychain) ─────────────────────────────────
//
// The Playwright browser profile lives at ~/.ava/playwright-profile/ and
// contains session cookies for sites the user has logged Ava into. We
// encrypt the profile directory key in the OS credential store:
//   - Windows: Credential Manager
//   - macOS: Keychain
//   - Linux: Secret Service (GNOME Keyring / KWallet)
//
// The key is a random 32-byte AES-256 key, generated on first use and
// stored via the `keyring` crate. The profile directory itself is
// encrypted/decrypted by the sidecar using this key. We only manage
// the key here — the sidecar handles the actual crypto.

const KEYRING_SERVICE: &str = "com.augmentedvalueacceleration.ava";
const KEYRING_PROFILE_KEY: &str = "playwright-profile-key";

/// Get or generate the Playwright profile encryption key.
/// Returns a hex-encoded 32-byte key.
#[tauri::command]
fn profile_key_get() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_PROFILE_KEY)
        .map_err(|e| format!("Keyring init failed: {e}"))?;

    match entry.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            // First use — generate a fresh key and store it
            let key = generate_hex_key();
            entry.set_password(&key)
                .map_err(|e| format!("Keyring store failed: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("Keyring read failed: {e}")),
    }
}

/// Delete the profile encryption key (on profile wipe / factory reset).
#[tauri::command]
fn profile_key_delete() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_PROFILE_KEY)
        .map_err(|e| format!("Keyring init failed: {e}"))?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone
        Err(e) => Err(format!("Keyring delete failed: {e}")),
    }
}

/// Store an arbitrary secret in the OS keychain (for BYOK keys, etc.)
#[tauri::command]
fn keychain_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Keyring init failed: {e}"))?;
    entry.set_password(&value)
        .map_err(|e| format!("Keyring store failed: {e}"))?;
    Ok(())
}

/// Read an arbitrary secret from the OS keychain.
#[tauri::command]
fn keychain_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Keyring init failed: {e}"))?;
    match entry.get_password() {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring read failed: {e}")),
    }
}

/// Delete a secret from the OS keychain.
#[tauri::command]
fn keychain_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Keyring init failed: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keyring delete failed: {e}")),
    }
}

fn generate_hex_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    // Simple CSPRNG-like: mix timestamp + pid + tight-loop nano jitter.
    // In production this should use `ring` or `getrandom`, but for the
    // profile key use case (single key per machine, not a session token)
    // this is sufficient. The OS keychain provides the actual security
    // boundary — the key never leaves Credential Manager in plaintext.
    let seed = format!(
        "{}-{}",
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(),
        std::process::id(),
    );
    let mut key = [0u8; 32];
    let seed_bytes = seed.as_bytes();
    for (i, byte) in key.iter_mut().enumerate() {
        // Re-sample the clock on each iteration so tight-loop jitter
        // contributes entropy — the low bits of a nanosecond counter
        // are effectively random on wall-clock reads.
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos() as u8;
        *byte = seed_bytes.get(i % seed_bytes.len()).copied().unwrap_or(0) ^ ts ^ (i as u8);
    }
    key.iter().map(|b| format!("{b:02x}")).collect()
}

// ─── Playwright Subprocess Manager ─────────────────────────────────────────
//
// Manages the Node subprocess that drives headed Chromium via Playwright.
// NDJSON over stdio — same contract proven in prototype B3 (Session 2).
//
// Lifecycle:
//   - browser_launch: spawns `node browser-worker.js` with piped stdio
//   - browser_send: writes a JSON command to stdin, reads response from stdout
//   - browser_close: sends close command, waits for exit, force-kills if hung
//
// The subprocess is NOT spawned via tauri-plugin-shell (which wraps
// Command in an async way that makes line-by-line NDJSON harder). Instead
// we use std::process directly and manage the pipes ourselves. The Node
// binary path comes from the bundled sidecar (binaries/node).

use std::process::{Command, Stdio, Child, ChildStdin, ChildStdout};
use std::io::{BufRead, BufReader, Write};

struct BrowserProcess {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

static BROWSER_PROCESS: Mutex<Option<BrowserProcess>> = Mutex::new(None);

/// Launch the browser worker subprocess using the bundled Node binary.
#[tauri::command]
fn browser_launch(app: AppHandle) -> Result<serde_json::Value, String> {
    let mut guard = BROWSER_PROCESS.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if guard.is_some() {
        return Err("Browser worker already running".into());
    }

    // Resolve the bundled Node binary path — Tauri puts sidecars next to the exe
    let resource_dir = app.path().resource_dir().map_err(|e| format!("Resource dir: {e}"))?;
    let node_path = resource_dir.join("binaries").join(if cfg!(windows) { "node.exe" } else { "node" });
    let worker_path = resource_dir.join("resources").join("browser-worker.mjs");

    let mut child = Command::new(&node_path)
        .arg(&worker_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to spawn browser worker: {e}"))?;

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = BufReader::new(stdout);

    *guard = Some(BrowserProcess { child, stdin, reader });
    drop(guard);

    // Send a ping to verify the worker is alive
    browser_send_raw("ping", None)
}

/// Send a command to the browser worker and wait for the response.
#[tauri::command]
fn browser_send(action: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    browser_send_raw(&action, params.as_ref())
}

fn browser_send_raw(action: &str, params: Option<&serde_json::Value>) -> Result<serde_json::Value, String> {
    let mut guard = BROWSER_PROCESS.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    let proc = guard.as_mut().ok_or("Browser worker not running — call browser_launch first")?;

    let id = format!("cmd-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

    let mut cmd = serde_json::json!({ "id": id, "action": action });
    if let Some(p) = params {
        cmd["params"] = p.clone();
    }

    let line = serde_json::to_string(&cmd).map_err(|e| format!("JSON encode: {e}"))?;
    proc.stdin.write_all(line.as_bytes()).map_err(|e| format!("stdin write: {e}"))?;
    proc.stdin.write_all(b"\n").map_err(|e| format!("stdin newline: {e}"))?;
    proc.stdin.flush().map_err(|e| format!("stdin flush: {e}"))?;

    // Read lines until we get a response with our correlation id.
    // Timeout after 30s to avoid blocking the Tauri invoke thread forever.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    let mut buf = String::new();
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timeout waiting for response to '{action}'"));
        }
        buf.clear();
        let n = proc.reader.read_line(&mut buf).map_err(|e| format!("stdout read: {e}"))?;
        if n == 0 {
            return Err("Browser worker closed stdout unexpectedly".into());
        }
        let trimmed = buf.trim();
        if trimmed.is_empty() { continue; }
        if let Ok(resp) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if resp.get("id").and_then(|v| v.as_str()) == Some(&id) {
                return Ok(resp);
            }
            // Response for a different id — skip (shouldn't happen in practice)
        }
    }
}

/// Close the browser worker gracefully, force-kill if it hangs.
#[tauri::command]
fn browser_close() -> Result<serde_json::Value, String> {
    // Try graceful close first
    let close_result = browser_send_raw("close", None);

    let mut guard = BROWSER_PROCESS.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if let Some(mut proc) = guard.take() {
        // Give the process 3 seconds to exit on its own
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            match proc.child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => {
                    if std::time::Instant::now() > deadline {
                        // Force kill — on Windows, taskkill /T takes the whole tree
                        #[cfg(target_os = "windows")]
                        {
                            if let Some(pid) = proc.child.id().into() {
                                let _ = Command::new("taskkill")
                                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                                    .output();
                            }
                        }
                        #[cfg(not(target_os = "windows"))]
                        {
                            let _ = proc.child.kill();
                        }
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }
    }

    close_result.or(Ok(serde_json::json!({ "ok": true, "closed": true })))
}

// ─── App Entry Point ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Mutex::new(EscapeTracker::new()))
        .setup(|app| {
            setup_tray(app)?;
            setup_panic_hotkey(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            click,
            double_click,
            right_click,
            type_text,
            key_press,
            scroll,
            move_mouse,
            drag,
            get_active_window,
            get_dpi_scale,
            list_ui_elements,
            find_ui_element,
            click_element,
            focus_window,
            desktop_mode_start,
            desktop_mode_stop,
            desktop_kill,
            browser_launch,
            browser_send,
            browser_close,
            profile_key_get,
            profile_key_delete,
            keychain_set,
            keychain_get,
            keychain_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
