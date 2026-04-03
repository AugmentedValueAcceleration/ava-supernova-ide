use base64::Engine as _;
use serde::Serialize;
use std::io::Cursor;

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
#[tauri::command]
fn capture_screen() -> Result<serde_json::Value, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;
    let screen = screens.into_iter().next().ok_or("No screens found")?;
    let capture = screen.capture().map_err(|e| format!("Failed to capture screen: {e}"))?;

    let width = capture.width();
    let height = capture.height();

    let mut buf = Cursor::new(Vec::new());
    capture.write_to(&mut buf, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());

    Ok(serde_json::json!({
        "image": b64,
        "width": width,
        "height": height,
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

// ─── App Entry Point ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
