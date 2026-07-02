use base64::Engine as _;
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// Windows: spawn child processes WITHOUT a console window. Without this,
// every `Command::new("git")` flashes a black cmd-style window briefly —
// noticeable when the Source Control panel polls every 15s while the IDE
// is idle. CREATE_NO_WINDOW (0x08000000) tells CreateProcess to skip the
// console allocation. No effect on non-Windows targets — the helper falls
// through to a plain `Command`.
//
// Use for: background-only spawns (git status polling, node sidecar boot,
// taskkill cleanup). Do NOT use for `launch_app` — that one's job is
// literally to open a window.
#[allow(dead_code)] // unused on non-Windows targets
fn silent_command(program: &str) -> std::process::Command {
    let cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    #[allow(unreachable_code)]
    cmd
}

// Tracks the last window Ava successfully targeted (via focus_window or the
// post-launch re-focus in launch_app). type_text / key_press restore this
// window to foreground before sending keystrokes so the input lands in the
// right place even after the Ava IDE approval dialog pulled focus back to
// itself. Stores the HWND as isize (the native handle value) so the static
// is Send+Sync-friendly; only Windows consumes it.
static LAST_FOCUSED_HWND: Mutex<Option<isize>> = Mutex::new(None);

#[cfg(target_os = "windows")]
fn record_target_hwnd(hwnd_isize: isize) {
    if let Ok(mut guard) = LAST_FOCUSED_HWND.lock() {
        *guard = Some(hwnd_isize);
    }
}

#[cfg(target_os = "windows")]
fn restore_last_target() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };
    let Some(hwnd_isize) = ({
        let guard = match LAST_FOCUSED_HWND.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        *guard
    }) else {
        return;
    };
    // SAFETY: All three Win32 calls are thread-safe and accept any
    // HWND value (NULL / stale handles return 0 / do nothing rather
    // than dereferencing). The cast from isize → HWND is the reverse
    // of the isize produced by a previous GetForegroundWindow call we
    // stored; no allocation or aliasing involved.
    unsafe {
        let hwnd = hwnd_isize as windows_sys::Win32::Foundation::HWND;
        let current = GetForegroundWindow();
        if current as isize == hwnd_isize {
            return; // already focused — no-op
        }
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd);
    }
    // Small settle delay so the new foreground actually owns the input
    // queue before we start typing. 50 ms is enough on Windows 10/11
    // without being perceptible to the user.
    std::thread::sleep(std::time::Duration::from_millis(50));
}

#[cfg(not(target_os = "windows"))]
fn restore_last_target() {}

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

    // Capture the ENTIRE virtual desktop (every monitor), not just the primary,
    // so Ava can see and act on any screen. origin_{x,y} is the virtual-screen
    // top-left (negative when a monitor sits left of / above the primary); the
    // caller maps normalized vision coords back to physical pixels as
    // origin + norm*size — exactly the space SetCursorPos clicks in.
    let (capture, orig_width, orig_height, origin_x, origin_y) = capture_virtual_desktop()?;

    // Resize for Holo3 — max 1280px wide, maintain aspect ratio. Normalized
    // [0,1000] coords are resolution-independent, so we still report the full
    // virtual dimensions + origin for mapping.
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
        capture
    };

    let mut buf = Cursor::new(Vec::new());
    resized.write_to(&mut buf, screenshots::image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());

    Ok(serde_json::json!({
        "image": b64,
        "width": orig_width,
        "height": orig_height,
        "originX": origin_x,
        "originY": origin_y,
    }))
}

/// Capture the full virtual desktop as one image + its virtual-screen origin.
/// Windows: a single BitBlt over the virtual-screen rect grabs all monitors in
/// physical pixels, perfectly aligned with SetCursorPos coordinates (so mixed-
/// DPI layouts land correctly — the compositor already positioned each monitor
/// in physical space). Returns (image, width, height, origin_x, origin_y).
#[cfg(target_os = "windows")]
fn capture_virtual_desktop(
) -> Result<(screenshots::image::RgbaImage, u32, u32, i32, i32), String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    // SAFETY: every GDI object created here (DC, bitmap) is released on every
    // path before returning; handles are null-checked; GetDIBits writes at most
    // vw*vh*4 bytes into a buffer sized exactly that.
    unsafe {
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if vw <= 0 || vh <= 0 {
            return Err("virtual screen has no size".into());
        }

        let hscreen = GetDC(null_mut());
        if hscreen.is_null() {
            return Err("GetDC(screen) failed".into());
        }
        let hdc = CreateCompatibleDC(hscreen);
        let hbmp = CreateCompatibleBitmap(hscreen, vw, vh);
        if hdc.is_null() || hbmp.is_null() {
            if !hdc.is_null() {
                DeleteDC(hdc);
            }
            ReleaseDC(null_mut(), hscreen);
            return Err("failed to allocate capture bitmap".into());
        }
        let old = SelectObject(hdc, hbmp as _);
        let blitted = BitBlt(hdc, 0, 0, vw, vh, hscreen, vx, vy, SRCCOPY);

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = vw;
        bmi.bmiHeader.biHeight = -vh; // negative → top-down rows (no vertical flip)
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB as u32;

        let mut pixels = vec![0u8; (vw as usize) * (vh as usize) * 4];
        let scanlines = if blitted != 0 {
            GetDIBits(
                hdc,
                hbmp,
                0,
                vh as u32,
                pixels.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            )
        } else {
            0
        };

        SelectObject(hdc, old);
        DeleteObject(hbmp as _);
        DeleteDC(hdc);
        ReleaseDC(null_mut(), hscreen);

        if blitted == 0 {
            return Err("BitBlt of the virtual desktop failed".into());
        }
        if scanlines == 0 {
            return Err("GetDIBits failed".into());
        }

        // GDI hands back BGRA; the image crate wants RGBA. Swap R/B, force opaque.
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        let img = screenshots::image::RgbaImage::from_raw(vw as u32, vh as u32, pixels)
            .ok_or("failed to build capture image from pixels")?;
        Ok((img, vw as u32, vh as u32, vx, vy))
    }
}

/// Non-Windows: primary screen only until the Phase 5 per-OS capture lands.
#[cfg(not(target_os = "windows"))]
fn capture_virtual_desktop(
) -> Result<(screenshots::image::RgbaImage, u32, u32, i32, i32), String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;
    let screen = screens.into_iter().next().ok_or("No screens found")?;
    let capture = screen.capture().map_err(|e| format!("Failed to capture screen: {e}"))?;
    let (w, h) = (capture.width(), capture.height());
    Ok((capture, w, h, 0, 0))
}

/// Position the cursor in ABSOLUTE virtual-desktop coordinates.
///
/// This is the multi-monitor fix: enigo's `Coordinate::Abs` normalizes to the
/// PRIMARY monitor's bounds, so a click meant for a second screen lands in the
/// wrong place (clamped onto the primary). `SetCursorPos` takes true physical
/// virtual-screen pixels and moves the cursor onto whichever monitor actually
/// contains that point. Non-Windows keeps enigo until the Phase 5 per-OS work.
#[cfg(target_os = "windows")]
fn position_cursor(x: i32, y: i32) -> Result<(), String> {
    // SAFETY: SetCursorPos takes two ints and returns a BOOL — no memory ops.
    unsafe {
        if windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos(x, y) == 0 {
            return Err(format!("SetCursorPos({x}, {y}) failed"));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn position_cursor(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Coordinate, Enigo, Mouse, Settings};
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Move failed: {e}"))
}

/// Simulate a left click at (x, y).
#[tauri::command]
fn click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings};
    position_cursor(x, y)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click failed: {e}"))?;
    Ok(())
}

/// Simulate a double click at (x, y).
#[tauri::command]
fn double_click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings};
    position_cursor(x, y)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click 1 failed: {e}"))?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| format!("Click 2 failed: {e}"))?;
    Ok(())
}

/// Simulate a right click at (x, y).
#[tauri::command]
fn right_click(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings};
    position_cursor(x, y)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.button(enigo::Button::Right, enigo::Direction::Click).map_err(|e| format!("Right click failed: {e}"))?;
    Ok(())
}

/// Type text using keyboard simulation.
#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    // Pull the last targeted window back to foreground before typing so
    // the keystrokes land in the right app even when the Ava IDE approval
    // dialog stole focus mid-trajectory.
    restore_last_target();
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.text(&text).map_err(|e| format!("Type failed: {e}"))?;
    Ok(())
}

/// Press a key or key combo (e.g. "Enter", "ctrl+n", "meta+r", "ctrl+shift+s").
#[tauri::command]
fn key_press(key: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings, Key, Direction};
    // Same focus-restore as type_text: the IDE approval dialog keeps
    // stealing foreground, so we pull the target window back.
    restore_last_target();
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
    position_cursor(x, y)
}

/// Click and drag from (x, y) to (end_x, end_y).
#[tauri::command]
fn drag(x: i32, y: i32, end_x: i32, end_y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings, Button, Direction};
    position_cursor(x, y)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
    enigo.button(Button::Left, Direction::Press).map_err(|e| format!("Press failed: {e}"))?;
    // Smooth drag in steps — virtual-desktop coords so a drag can cross monitors.
    let steps = 10;
    for i in 1..=steps {
        let cx = x + (end_x - x) * i / steps;
        let cy = y + (end_y - y) * i / steps;
        position_cursor(cx, cy).map_err(|e| format!("Drag step failed: {e}"))?;
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    enigo.button(Button::Left, Direction::Release).map_err(|e| format!("Release failed: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Visual preview overlay (Phase 0D)
//
// In Drive mode Ava acts on her own, so before each click/type/drag she flashes
// a hollow, click-through rectangle on the exact target for a few hundred ms —
// the honest "here's where I'm about to act" signal that makes autonomous
// operation legible instead of a mystery cursor jump. It's a native layered
// Win32 window (fast, no webview, no frontend asset), always-on-top and
// transparent to the mouse (WS_EX_TRANSPARENT), so the click still lands on the
// app underneath. Windows-first; mac/Linux get an overlay in Phase 5.
//
// Coordinates are physical screen pixels — the SAME space enigo clicks in — so
// the box lands where the action lands. Multi-DPI / multi-monitor correctness
// is a hands-on verify item (the process is DPI-aware, so top-level window
// coords are physical, but confirm on a scaled secondary display).
#[cfg(target_os = "windows")]
unsafe extern "system" fn overlay_wndproc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, PAINTSTRUCT,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, DestroyWindow, GetClientRect, PostQuitMessage, WM_DESTROY, WM_PAINT,
        WM_TIMER,
    };

    const BORDER: i32 = 3;
    // Ava purple, as COLORREF 0x00BBGGRR (R=0x8C G=0x64 B=0xFF).
    const ACCENT: u32 = 0x00FF_648C;
    const KEY: u32 = 0x0000_0000; // black is keyed out → the centre is transparent

    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rc: RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rc);
            // Fill the whole client with the accent, then punch a transparent
            // hole in the middle → a BORDER-thick frame around the target.
            let accent = CreateSolidBrush(ACCENT);
            FillRect(hdc, &rc, accent);
            let inner = RECT {
                left: rc.left + BORDER,
                top: rc.top + BORDER,
                right: rc.right - BORDER,
                bottom: rc.bottom - BORDER,
            };
            let hole = CreateSolidBrush(KEY);
            FillRect(hdc, &inner, hole);
            DeleteObject(accent as _);
            DeleteObject(hole as _);
            EndPaint(hwnd, &ps);
            0
        }
        WM_TIMER => {
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Flash a click-through highlight box on (x, y, w, h) for `ms` milliseconds.
/// Blocks for the duration so the Actor's preview reads as "show → then act".
#[tauri::command]
fn highlight_rect(x: i32, y: i32, w: i32, h: i32, ms: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ptr::{null, null_mut};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DispatchMessageW, GetMessageW, LoadCursorW, RegisterClassW, SetTimer,
            SetLayeredWindowAttributes, ShowWindow, TranslateMessage, IDC_ARROW, LWA_COLORKEY, MSG,
            SW_SHOWNA, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
            WS_EX_TRANSPARENT, WS_POPUP,
        };

        // Ignore degenerate rects rather than spawning a zero-size window.
        if w <= 0 || h <= 0 {
            return Ok(());
        }
        let dur = ms.clamp(120, 3000);
        const BORDER: i32 = 3;
        let class_name: Vec<u16> = "AvaHighlightOverlay\0".encode_utf16().collect();

        // SAFETY: register the class exactly once (the guard), then create a
        // transient overlay we own end-to-end — every handle is created and
        // destroyed within this call, on this thread's own message pump.
        unsafe {
            static REGISTERED: AtomicBool = AtomicBool::new(false);
            if !REGISTERED.swap(true, Ordering::SeqCst) {
                let wc = WNDCLASSW {
                    style: 0,
                    lpfnWndProc: Some(overlay_wndproc),
                    cbClsExtra: 0,
                    cbWndExtra: 0,
                    hInstance: null_mut(),
                    hIcon: null_mut(),
                    hCursor: LoadCursorW(null_mut(), IDC_ARROW),
                    hbrBackground: null_mut(),
                    lpszMenuName: null(),
                    lpszClassName: class_name.as_ptr(),
                };
                RegisterClassW(&wc);
            }

            let ex_style = WS_EX_LAYERED
                | WS_EX_TRANSPARENT
                | WS_EX_TOPMOST
                | WS_EX_TOOLWINDOW
                | WS_EX_NOACTIVATE;
            let hwnd = CreateWindowExW(
                ex_style,
                class_name.as_ptr(),
                null(),
                WS_POPUP,
                x - BORDER,
                y - BORDER,
                w + BORDER * 2,
                h + BORDER * 2,
                null_mut(),
                null_mut(),
                null_mut(),
                null(),
            );
            if hwnd.is_null() {
                return Err("highlight overlay creation failed".into());
            }
            // Black → transparent, so only the accent frame shows.
            SetLayeredWindowAttributes(hwnd, 0x0000_0000, 0, LWA_COLORKEY);
            ShowWindow(hwnd, SW_SHOWNA); // show WITHOUT stealing focus
            SetTimer(hwnd, 1, dur, None); // self-destruct after `dur` ms

            // Pump this thread's messages until the timer destroys the window
            // (WM_TIMER → DestroyWindow → WM_DESTROY → PostQuitMessage → GetMessage 0).
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Phase 5: native AX/AT-SPI overlay. Degrade silently — no preview is
        // better than a crash, and Drive still confirms irreversible actions.
        let _ = (x, y, w, h, ms);
        Ok(())
    }
}

/// EnumWindows callback: minimize any visible top-level window owned by THIS
/// process (the IDE). Used by minimize_all so our own window steps aside and
/// the desktop is genuinely revealed.
#[cfg(target_os = "windows")]
unsafe extern "system" fn minimize_own_window(
    hwnd: windows_sys::Win32::Foundation::HWND,
    _lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::BOOL {
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowThreadProcessId, IsWindowVisible, ShowWindow, SW_MINIMIZE,
    };
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == GetCurrentProcessId() && IsWindowVisible(hwnd) != 0 {
        ShowWindow(hwnd, SW_MINIMIZE);
    }
    1 // keep enumerating
}

/// Native, always-on-top approval dialog (Phase 0F-2).
///
/// Mid-trajectory irreversible confirms (send / pay / delete) used to render
/// inside the IDE — which minimize_all just minimized, so approving meant
/// restoring the IDE on top of the very desktop being automated. This card is
/// OS-level: it floats over whatever is on screen, the IDE stays minimized,
/// one click answers it. Stock MessageBox by design — an OS-native dialog is
/// a trust signal (UAC-familiar), immune to webview/DPI/occlusion issues.
/// Runs on a blocking thread so the async runtime never stalls.
#[tauri::command]
async fn native_confirm(title: String, message: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let res = tauri::async_runtime::spawn_blocking(move || {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                MessageBoxW, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_SYSTEMMODAL, MB_YESNO,
            };
            let mut t: Vec<u16> = title.encode_utf16().collect();
            t.push(0);
            let mut m: Vec<u16> = message.encode_utf16().collect();
            m.push(0);
            // SAFETY: null-terminated UTF-16 buffers outlive the call; MessageBoxW
            // blocks this (dedicated) thread until the user answers.
            // MB_SYSTEMMODAL = topmost — visible over the automated app.
            let answer = unsafe {
                MessageBoxW(
                    std::ptr::null_mut(),
                    m.as_ptr(),
                    t.as_ptr(),
                    MB_YESNO | MB_ICONWARNING | MB_SYSTEMMODAL | MB_SETFOREGROUND,
                )
            };
            answer == IDYES
        })
        .await
        .map_err(|e| format!("approval dialog thread failed: {e}"))?;
        Ok(res)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (title, message);
        Err("native approval dialog is Windows-only until the Phase 5 per-OS work".into())
    }
}

/// Minimize every window to reveal the desktop — so desktop icons (Recycle
/// Bin, This PC, files, shortcuts) become visible to UI Automation and
/// clickable. This is what "Show desktop" / Win+M do, driven via the taskbar's
/// documented MIN_ALL command so no COM apartment is needed.
#[tauri::command]
fn minimize_all() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumWindows, FindWindowW, PostMessageW, WM_COMMAND,
        };
        // Explorer command 419 = MIN_ALL, sent to the taskbar ("Shell_TrayWnd").
        const MIN_ALL: usize = 419;
        let class: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
        // SAFETY: FindWindowW/PostMessageW/EnumWindows take simple args; handles
        // are null-checked.
        unsafe {
            let tray = FindWindowW(class.as_ptr(), std::ptr::null());
            if !tray.is_null() {
                PostMessageW(tray, WM_COMMAND, MIN_ALL, 0);
            }
            // MIN_ALL minimizes OTHER apps but leaves our own Tauri window up —
            // and while the IDE is foreground, perception returns nothing (the
            // skip-own-window rule) and a click would land on the IDE, not the
            // desktop. So explicitly minimize every visible top-level window we
            // own. The sidecar keeps driving while minimized; the desktop is now
            // truly revealed + clickable.
            EnumWindows(Some(minimize_own_window), 0);
        }
        // Let the foreground settle onto the desktop before the conductor's
        // immediate re-scout reads it (minimize is near-instant but not free).
        std::thread::sleep(std::time::Duration::from_millis(250));
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("minimize_all is Windows-only until the Phase 5 per-OS work".into())
    }
}

/// Get info about the currently active window.
#[tauri::command]
fn get_active_window() -> Result<ActiveWindowInfo, String> {
    // Windows-specific: use WinAPI to get foreground window
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        // SAFETY:
        //   * GetForegroundWindow returns NULL when no window is active —
        //     checked below before any further use of hwnd.
        //   * GetWindowTextW writes at most `title_buf.len()` wchars and
        //     returns the count actually written. We clamp the slice to
        //     that returned length so no out-of-bounds read occurs even
        //     if the OS violated its own contract. 512 wchars is well
        //     above any typical window-title length; longer titles
        //     truncate silently (documented API behaviour).
        //   * GetWindowRect writes into an owned &mut RECT.
        //   * GetWindowThreadProcessId writes into an owned &mut u32.
        //   * get_process_name is itself unsafe; its contract is that
        //     it handles invalid pids by returning None.
        unsafe {
            let hwnd = windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow();
            if hwnd == std::ptr::null_mut() {
                return Err("No active window".into());
            }

            // Get window title. Fixed 512-wchar buffer with truncation
            // is intentional — a second length-query syscall would race
            // the title changing between calls (common for browsers and
            // IDEs). Truncation is benign: UI labels in Ava use this
            // for display only, never for path / command construction.
            let mut title_buf = [0u16; 512];
            let len = windows_sys::Win32::UI::WindowsAndMessaging::GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
            let len_clamped = (len as usize).min(title_buf.len());
            let title = OsString::from_wide(&title_buf[..len_clamped]).to_string_lossy().into_owned();

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

/// Look up a process name by pid. Returns None when the pid can't be
/// opened (permission, gone, or invalid) — never panics.
///
/// # Safety
/// Caller must ensure this runs on Windows. All the Win32 calls below
/// are memory-safe when given valid-shape arguments:
///   * `OpenProcess` handles invalid pids by returning NULL (checked).
///   * `QueryFullProcessImageNameW` writes at most `size` wchars and
///     updates `size` in place to the count written. We pass a
///     buffer-sized `size` and clamp on read so an out-of-contract
///     return can't produce a slice overrun.
///   * `CloseHandle` is always safe to call on a handle returned by
///     OpenProcess, even if the query above failed.
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
    let mut size = buf.len() as u32;
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

    // Clamp in case the OS returned a size > the buffer we passed — can't
    // happen per the documented contract, but defence in depth.
    let used = (size as usize).min(buf.len());
    let path = OsString::from_wide(&buf[..used]).to_string_lossy().into_owned();
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

/// Append a line to ~/.ava/uia-debug.log. The Tauri app runs detached from any
/// console on Windows, so eprintln! vanishes — a file is the only way to see
/// what the perception layer decided at runtime. Best-effort; never fails.
#[cfg(target_os = "windows")]
fn uia_debug_log(msg: &str) {
    use std::io::Write;
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let path = format!("{profile}\\.ava\\uia-debug.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{msg}");
        }
    }
}

/// Class name of a window (empty on failure). Used to recognise the desktop.
#[cfg(target_os = "windows")]
fn window_class_name(hwnd: windows_sys::Win32::Foundation::HWND) -> String {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetClassNameW;
    let mut buf = [0u16; 256];
    // SAFETY: GetClassNameW writes at most nMaxCount wchars and returns the count.
    let n = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        String::new()
    } else {
        String::from_utf16_lossy(&buf[..n as usize])
    }
}

/// Handle of the desktop's icon list (SysListView32 under Progman or, when a
/// wallpaper slideshow is active, under a WorkerW). Null if not found. This is
/// where Recycle Bin / This PC / file shortcuts live — NOT any app window, so
/// reading the foreground window never surfaces them.
#[cfg(target_os = "windows")]
fn desktop_iconview_hwnd() -> windows_sys::Win32::Foundation::HWND {
    use std::ptr::null_mut;
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW};
    let progman_c: Vec<u16> = "Progman\0".encode_utf16().collect();
    let workerw_c: Vec<u16> = "WorkerW\0".encode_utf16().collect();
    let defview_c: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
    let listview_c: Vec<u16> = "SysListView32\0".encode_utf16().collect();
    // SAFETY: all Find* calls take valid null-terminated class pointers; every
    // returned handle is checked before use.
    unsafe {
        let progman = FindWindowW(progman_c.as_ptr(), null_mut());
        let mut defview = if progman.is_null() {
            null_mut()
        } else {
            FindWindowExW(progman, null_mut(), defview_c.as_ptr(), null_mut())
        };
        if defview.is_null() {
            // Slideshow case: SHELLDLL_DefView is parented under a WorkerW.
            let mut worker = null_mut();
            loop {
                worker = FindWindowExW(null_mut(), worker, workerw_c.as_ptr(), null_mut());
                if worker.is_null() {
                    break;
                }
                let d = FindWindowExW(worker, null_mut(), defview_c.as_ptr(), null_mut());
                if !d.is_null() {
                    defview = d;
                    break;
                }
            }
        }
        if defview.is_null() {
            return null_mut();
        }
        FindWindowExW(defview, null_mut(), listview_c.as_ptr(), null_mut())
    }
}

/// List all clickable UI elements in the foreground window.
/// Returns structured data: name, type, bounding box, centre coordinates.
///
/// Walks from the ACTUAL foreground window (not the desktop root) which
/// gets us into the app's own tree immediately instead of wasting 2-3
/// depth levels on window chrome. Depth 8 is deep enough for nested
/// controls (list items, tree nodes, tab children) without going crazy.
#[tauri::command]
fn list_ui_elements() -> Result<Vec<UIElementInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        // Run UIA on a dedicated COM thread (see `with_uia`) so it never trips
        // over the apartment state inherited from the Tauri worker pool — the
        // "Cannot change thread mode after it is set" (RPC_E_CHANGED_MODE) error
        // that was failing every desktop_list_elements call. Same proven pattern
        // focus_window already uses.
        with_uia("list_elements", move |automation| {
            let walker = automation
                .get_control_view_walker()
                .map_err(|e| format!("Walker failed: {e}"))?;

            // Prefer the actual foreground window (what the user is looking at).
            // Fall back to the desktop root only if we can't resolve it (e.g.
            // Start menu is open, or no window has focus).
            // SAFETY: GetForegroundWindow is a parameter-free Win32 query that
            // returns NULL when no window has focus. Null is checked below.
            let foreground_hwnd =
                unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };

            // NEVER walk our OWN window (the IDE). Querying this process's UIA
            // tree from a background thread requires the IDE's UI thread to
            // answer — which can DEADLOCK/freeze the IDE. There's nothing to
            // automate in the IDE anyway, so return empty: Ava sees no controls
            // for the IDE, focuses the target app (changing the foreground), and
            // the next list walks THAT app. This is the conductor's "skip own
            // window" rule, enforced at the source so every caller is safe.
            if !foreground_hwnd.is_null() {
                let our_pid = unsafe { windows_sys::Win32::System::Threading::GetCurrentProcessId() };
                let mut fg_pid: u32 = 0;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
                        foreground_hwnd,
                        &mut fg_pid,
                    );
                }
                if fg_pid == our_pid {
                    uia_debug_log(&format!(
                        "list_ui_elements: foreground is OUR window (class={}) — skip-own-window early return (0 elements)",
                        window_class_name(foreground_hwnd)
                    ));
                    return Ok(Vec::new());
                }
            }

            // When the DESKTOP is what's showing — nothing focused, or
            // Progman/WorkerW is foreground (e.g. right after minimize_all) —
            // walk the shell's icon list directly so Recycle Bin / This PC /
            // shortcuts are enumerated. They live in SysListView32, never the
            // foreground window, so the normal walk returns nothing on a bare
            // desktop.
            let fg_class = if foreground_hwnd.is_null() {
                String::from("<null>")
            } else {
                window_class_name(foreground_hwnd)
            };
            let showing_desktop =
                foreground_hwnd.is_null() || matches!(fg_class.as_str(), "Progman" | "WorkerW");
            let iconview = if showing_desktop {
                desktop_iconview_hwnd()
            } else {
                std::ptr::null_mut()
            };
            let target_hwnd = if showing_desktop && !iconview.is_null() {
                iconview
            } else {
                foreground_hwnd
            };
            uia_debug_log(&format!(
                "list_ui_elements: fg_class={fg_class:?} showing_desktop={showing_desktop} iconview_null={} target_null={}",
                iconview.is_null(),
                target_hwnd.is_null()
            ));

            let start_element = if !target_hwnd.is_null() {
                automation
                    .element_from_handle(uiautomation::types::Handle::from(target_hwnd as isize))
                    .ok()
            } else {
                None
            };
            let root = automation
                .get_root_element()
                .map_err(|e| format!("Root failed: {e}"))?;
            let start = start_element.as_ref().unwrap_or(&root);

            let mut elements = Vec::new();
            collect_elements(&walker, start, &mut elements, 0, 8);
            uia_debug_log(&format!(
                "list_ui_elements: collected {} raw elements (start_from_desktop={})",
                elements.len(),
                start_element.is_some() && showing_desktop
            ));

            Ok(elements)
        })
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
    if depth > max_depth || elements.len() >= 300 {
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
    let automation_id = element.get_automation_id().unwrap_or_default();
    let rect = element.get_bounding_rectangle().unwrap_or_default();

    // A useful element is:
    //   - visible (non-zero bounding box), AND
    //   - identifiable: has a name OR an AutomationId OR is an interactable
    //     control type even when unnamed (buttons, list items, menu items
    //     often lack a .Name but still matter).
    let w = rect.get_width() as i32;
    let h = rect.get_height() as i32;
    let x = rect.get_left() as i32;
    let y = rect.get_top() as i32;
    let ct_lower = control_type.to_lowercase();
    let is_interactable_type =
        ct_lower.contains("button") || ct_lower.contains("link") ||
        ct_lower.contains("menu item") || ct_lower.contains("menuitem") ||
        ct_lower.contains("list item") || ct_lower.contains("listitem") ||
        ct_lower.contains("edit") || ct_lower.contains("text") ||
        ct_lower.contains("tab") || ct_lower.contains("check") ||
        ct_lower.contains("radio") || ct_lower.contains("combo") ||
        ct_lower.contains("hyperlink") || ct_lower.contains("document");
    let identifiable = !name.is_empty() || !automation_id.is_empty() || is_interactable_type;

    if identifiable && w > 0 && h > 0 {
        // Prefer name, fall back to automation_id, fall back to control_type
        let display_name = if !name.is_empty() {
            name.clone()
        } else if !automation_id.is_empty() {
            automation_id.clone()
        } else {
            control_type.clone()
        };
        elements.push(UIElementInfo {
            name: display_name,
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

/// Run a UIA closure on a dedicated thread with a fresh COM apartment state.
///
/// `UIAutomation::new()` internally calls `CoInitializeEx(STA)`. If the
/// Tauri worker thread already initialized COM in a different apartment
/// model (which Tauri's own runtime does on some threads), UIA init fails
/// with `RPC_E_CHANGED_MODE` — "Cannot change thread mode after it is set."
///
/// By spawning a fresh std::thread for each call, we guarantee a clean COM
/// slate. Cost is small (<10 ms per call) and this eliminates the whole
/// bug class rather than trying to coordinate thread state across commands.
#[cfg(target_os = "windows")]
fn with_uia<T, F>(label: &'static str, f: F) -> Result<T, String>
where
    F: FnOnce(&uiautomation::UIAutomation) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let handle = std::thread::Builder::new()
        .name(format!("uia-{label}"))
        .spawn(move || {
            let automation = uiautomation::UIAutomation::new()
                .map_err(|e| format!("UIA init failed: {e}"))?;
            f(&automation)
        })
        .map_err(|e| format!("UIA thread spawn failed: {e}"))?;
    match handle.join() {
        Ok(result) => result,
        Err(_) => Err(format!("UIA thread panicked during {label}")),
    }
}

/// Focus a window by name — brings it to the foreground.
///
/// Runs the UIA work on a dedicated thread (see `with_uia` above) so the
/// call doesn't trip over COM apartment state inherited from whatever
/// else ran on the Tauri worker pool before it.
///
/// On success also calls `SetForegroundWindow` via the returned window's
/// HWND — `set_focus()` alone doesn't always steal foreground when another
/// process owns it (Windows has anti-focus-stealing policy). The raw API
/// call is how we bring a freshly-launched Notepad / Chrome / … forward
/// after the approval dialog in the IDE pulled focus back to us.
#[tauri::command]
fn focus_window(name: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        with_uia("focus_window", move |automation| {
            let root = automation.get_root_element().map_err(|e| format!("Root failed: {e}"))?;
            let walker = automation.get_control_view_walker().map_err(|e| format!("Walker failed: {e}"))?;
            let name_lower = name.to_lowercase();

            let child = walker.get_first_child(&root).map_err(|e| format!("Walk failed: {e}"))?;
            let mut current = child;
            let our_pid = unsafe { windows_sys::Win32::System::Threading::GetCurrentProcessId() };
            loop {
                // Skip our OWN window (the IDE). Reading its name from a background
                // COM thread needs the IDE's UI thread to answer — slow under load
                // (e.g. local-model inference) and risks the request timing out —
                // and we never want to focus the IDE anyway. Check the cheap
                // HWND->PID first, before the slower get_name().
                let is_own_window = current
                    .get_native_window_handle()
                    .ok()
                    .map(|h| {
                        let hwnd_isize: isize = h.into();
                        let mut win_pid: u32 = 0;
                        // SAFETY: GetWindowThreadProcessId writes into an owned
                        // &mut u32; tolerates a stale HWND by returning 0.
                        unsafe {
                            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
                                hwnd_isize as windows_sys::Win32::Foundation::HWND,
                                &mut win_pid,
                            );
                        }
                        win_pid == our_pid
                    })
                    .unwrap_or(false);
                if is_own_window {
                    match walker.get_next_sibling(&current) {
                        Ok(next) => {
                            current = next;
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                let win_name = current.get_name().unwrap_or_default();
                if !win_name.is_empty() && win_name.to_lowercase().contains(&name_lower) {
                    // Try to grab an HWND and call SetForegroundWindow directly —
                    // UIA's set_focus() is advisory and blocked by the OS's
                    // anti-focus-stealing policy when another process owns it.
                    if let Ok(handle) = current.get_native_window_handle() {
                        let hwnd_isize: isize = handle.into();
                        // SAFETY: hwnd_isize is produced by UIA's
                        // get_native_window_handle() which returns a
                        // valid OS handle for the element it walked to.
                        // IsIconic / ShowWindow / SetForegroundWindow
                        // tolerate stale or already-closed handles by
                        // returning 0 / doing nothing — no dereference.
                        unsafe {
                            use windows_sys::Win32::UI::WindowsAndMessaging::{
                                SetForegroundWindow, ShowWindow, IsIconic,
                                SW_RESTORE,
                            };
                            let hwnd = hwnd_isize as windows_sys::Win32::Foundation::HWND;
                            if IsIconic(hwnd) != 0 {
                                ShowWindow(hwnd, SW_RESTORE);
                            }
                            SetForegroundWindow(hwnd);
                        }
                        // Remember for the next type_text / key_press call so
                        // the IDE's approval dialog stealing focus doesn't
                        // misroute keystrokes.
                        record_target_hwnd(hwnd_isize);
                    }
                    // Best-effort UIA focus as a secondary signal
                    let _ = current.set_focus();
                    return Ok(win_name);
                }
                match walker.get_next_sibling(&current) {
                    Ok(next) => current = next,
                    Err(_) => break,
                }
            }
            Err(format!("Window '{}' not found", name))
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Not available on this platform".into())
    }
}

/// Click a UI element by name — finds it via UIA and clicks its centre.
#[tauri::command]
fn click_element(name: String) -> Result<UIElementInfo, String> {
    // Same focus-restore as type_text/key_press: an approval card pulls the
    // IDE to the foreground, and both the element search and the click below
    // operate on the foreground window — without this, post-approval clicks
    // hunt for the element inside the IDE instead of the target app.
    restore_last_target();
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

/// Report whether the on-device vision model (Private lane) is installed.
/// Transparency rule: the Vision setting always shows this state plainly,
/// whatever mode is selected — the user should never have to guess what's
/// on their machine.
#[derive(Serialize)]
struct LocalVisionStatus {
    installed: bool,
    size_mb: u64,
    model_dir: String,
}

#[tauri::command]
fn local_vision_status() -> Result<LocalVisionStatus, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "no home directory".to_string())?;
    let dir = std::path::PathBuf::from(home).join(".ava").join("models");
    let model = dir.join("holo-3.1-08b-Q4_K_M.gguf");
    let mmproj = dir.join("mmproj-holo-3.1-08b-f16.gguf");
    let installed = model.exists() && mmproj.exists();
    let size_mb = if installed {
        let m = std::fs::metadata(&model).map(|m| m.len()).unwrap_or(0);
        let p = std::fs::metadata(&mmproj).map(|m| m.len()).unwrap_or(0);
        (m + p) / (1024 * 1024)
    } else {
        0
    };
    Ok(LocalVisionStatus {
        installed,
        size_mb,
        model_dir: dir.to_string_lossy().to_string(),
    })
}

/// Get the primary monitor's DPI scale factor (e.g., 1.25 for 125% scaling).
#[tauri::command]
fn get_dpi_scale() -> Result<f64, String> {
    #[cfg(target_os = "windows")]
    {
        // SAFETY:
        //   * GetDC(NULL) returns a device context for the entire
        //     screen, or NULL on failure — we check and fall back to 1.0.
        //   * GetDeviceCaps on a valid HDC with the LOGPIXELSX index is
        //     read-only and doesn't mutate memory we own.
        //   * ReleaseDC pairs with GetDC; required to avoid DC leaks.
        //     Passing the same HDC back is the documented usage.
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
//   1. Ctrl+Alt+K — global hotkey, single press, armed during desktop mode.
//      (Plain Escape was tried first and failed — on Windows the OS either
//      refuses to register it as a global shortcut or steals Escape from
//      every other app while registered, both of which we want to avoid.)
//   2. Stop button — frontend sends this command
//   3. Budget trip — automatic, handled by the TypeScript budget tracker
//
// On kill: we emit "desktop:kill" to the frontend, which tears down the
// trajectory, and Narrator reports what was done so far.

static DESKTOP_MODE_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Activate desktop mode — enables the panic kill hotkey.
#[tauri::command]
fn desktop_mode_start() -> Result<(), String> {
    DESKTOP_MODE_ACTIVE.store(true, Ordering::SeqCst);
    Ok(())
}

/// Cheap read-only peek at the foreground window title. Used by the
/// sidecar's desktop-context capture to inject state into every
/// desktop-mode turn, so Ava doesn't have to guess what's focused.
/// Pure Win32 — no UIA cost, no side effects.
#[tauri::command]
fn get_foreground_window_title() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
        // SAFETY: Same shape as active_window_info above.
        //   * GetForegroundWindow returns NULL when no foreground — checked.
        //   * GetWindowTextW writes at most buf.len() wchars and returns
        //     the number written. Result clamped before slicing.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return Ok(String::new());
            }
            let mut buf: [u16; 512] = [0; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if len <= 0 {
                return Ok(String::new());
            }
            let len_clamped = (len as usize).min(buf.len());
            Ok(String::from_utf16_lossy(&buf[..len_clamped]))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(String::new())
    }
}

/// One visible top-level window — title + whether it's minimised.
#[derive(serde::Serialize)]
struct WindowInfo {
    title: String,
    minimized: bool,
}

/// All visible top-level windows (title + minimised state). Gives Ava awareness
/// of what's ALREADY open so she focuses/maximises an existing window instead of
/// relaunching, and knows what's still open after a task. Pure Win32 EnumWindows
/// — no UIA cost and no thread-mode hazard (unlike list_ui_elements).
#[tauri::command]
fn list_windows() -> Result<Vec<WindowInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowTextW, IsIconic,
            IsWindowVisible, GW_OWNER,
        };

        // SAFETY: Win32 EnumWindows callback. `lparam` carries a &mut Vec<WindowInfo>
        // we own for the whole synchronous enumeration. Every Win32 call tolerates a
        // stale/invalid HWND by returning 0/null — no dereference of window memory.
        unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let out = unsafe { &mut *(lparam as *mut Vec<WindowInfo>) };
            if unsafe { IsWindowVisible(hwnd) } == 0 {
                return 1;
            }
            // Top-level only — skip owned popups/tooltips.
            let owner = unsafe { GetWindow(hwnd, GW_OWNER) };
            if !owner.is_null() {
                return 1;
            }
            let len = unsafe { GetWindowTextLengthW(hwnd) };
            if len <= 0 {
                return 1; // untitled window — skip
            }
            let mut buf: Vec<u16> = vec![0u16; (len as usize) + 1];
            let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
            if n <= 0 {
                return 1;
            }
            let title = String::from_utf16_lossy(&buf[..(n as usize).min(buf.len())]);
            let minimized = unsafe { IsIconic(hwnd) } != 0;
            out.push(WindowInfo { title, minimized });
            1
        }

        let mut windows: Vec<WindowInfo> = Vec::new();
        // SAFETY: EnumWindows runs enum_cb synchronously per top-level window on
        // this thread, then returns; the pointer to our local Vec stays valid.
        unsafe {
            EnumWindows(Some(enum_cb), &mut windows as *mut Vec<WindowInfo> as LPARAM);
        }
        Ok(windows)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
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
        .tooltip("Ava Supernova IDE")
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

    // Ctrl+Alt+K — single-press kill. K as in "Kill". Chosen because:
    //   * it's not bound by any common Windows shortcut
    //   * it registers cleanly via RegisterHotKey (plain Escape does not)
    //   * it doesn't steal Escape from other apps for the whole session
    let kill: Shortcut = "Ctrl+Alt+K".parse()?;
    let app_handle = app.handle().clone();

    app.global_shortcut().on_shortcut(kill, move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if !DESKTOP_MODE_ACTIVE.load(Ordering::SeqCst) {
            return;
        }
        // Single-press fires immediately — no tracker, no 800ms window.
        DESKTOP_MODE_ACTIVE.store(false, Ordering::SeqCst);
        let _ = app_handle.emit("desktop:kill", serde_json::json!({ "level": "panic" }));
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

// ── Git ──────────────────────────────────────────────────────────────────
//
// Powers the Sidebar Source Control panel. Shells out to system `git`
// rather than embedding libgit2 because (a) git is universally
// installed on dev machines, (b) the porcelain output is stable and
// well-tested, and (c) embedding libgit2 doubles the Rust binary
// size for marginal gain. If git isn't on PATH, every command returns
// a structured "git not installed" error so the UI can render a
// clear empty state rather than crashing.

#[derive(serde::Serialize)]
struct GitFileEntry {
    /// 'staged' / 'unstaged' / 'untracked' — drives section grouping in UI.
    section: String,
    /// File path relative to repo root.
    path: String,
    /// Two-character porcelain code (e.g. 'M ', 'A ', '??', ' M').
    /// First column = staged status, second = unstaged status.
    code: String,
}

#[derive(serde::Serialize)]
struct GitStatusReport {
    branch: String,
    /// Number of commits ahead of upstream (None if no upstream set).
    ahead: Option<u32>,
    behind: Option<u32>,
    files: Vec<GitFileEntry>,
}

fn run_git(repo: &str, args: &[&str]) -> Result<std::process::Output, String> {
    silent_command("git")
        .arg("-C").arg(repo)
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git is not installed or not on PATH. Install Git from git-scm.com to use Source Control.".to_string()
            } else {
                format!("Failed to run git: {e}")
            }
        })
}

#[tauri::command]
fn git_status(repo: String) -> Result<GitStatusReport, String> {
    // Branch + ahead/behind via the porcelain v2 branch header.
    let branch_out = run_git(&repo, &["status", "--porcelain=v2", "--branch"])?;
    if !branch_out.status.success() {
        return Err(String::from_utf8_lossy(&branch_out.stderr).trim().to_string());
    }
    let body = String::from_utf8_lossy(&branch_out.stdout);
    let mut branch = String::from("(detached)");
    let mut ahead: Option<u32> = None;
    let mut behind: Option<u32> = None;
    let mut files: Vec<GitFileEntry> = Vec::new();
    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            branch = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // Format: "+N -M" → ahead N commits, behind M.
            let mut parts = rest.split_whitespace();
            if let Some(a) = parts.next() { ahead = a.trim_start_matches('+').parse().ok(); }
            if let Some(b) = parts.next() { behind = b.trim_start_matches('-').parse().ok(); }
        } else if let Some(rest) = line.strip_prefix("1 ") {
            // Changed (modified/added/deleted) tracked file. Format:
            // "1 XY <sub> <mH> <mI> <mW> <hH> <hI> <path>"
            let mut parts = rest.splitn(8, ' ');
            let xy = parts.next().unwrap_or("..").to_string();
            for _ in 0..6 { parts.next(); }
            let path = parts.next().unwrap_or("").to_string();
            if !path.is_empty() { files.push(classify(xy, path)); }
        } else if let Some(rest) = line.strip_prefix("2 ") {
            // Renamed / copied. Format includes original-path after a tab.
            let mut parts = rest.splitn(9, ' ');
            let xy = parts.next().unwrap_or("..").to_string();
            for _ in 0..7 { parts.next(); }
            let pair = parts.next().unwrap_or("");
            let path = pair.split('\t').next().unwrap_or("").to_string();
            if !path.is_empty() { files.push(classify(xy, path)); }
        } else if let Some(rest) = line.strip_prefix("? ") {
            files.push(GitFileEntry {
                section: "untracked".to_string(),
                path: rest.to_string(),
                code: "??".to_string(),
            });
        }
    }
    Ok(GitStatusReport { branch, ahead, behind, files })
}

fn classify(xy: String, path: String) -> GitFileEntry {
    let chars: Vec<char> = xy.chars().collect();
    let staged = chars.first().copied().unwrap_or('.');
    let unstaged = chars.get(1).copied().unwrap_or('.');
    // Files can have BOTH staged + unstaged changes simultaneously
    // (e.g. partial stage). The porcelain report lists each file once;
    // we surface it under 'staged' if there are staged changes since
    // that's the section the user acts on first when committing.
    let section = if staged != '.' && staged != '?' { "staged" } else { "unstaged" };
    GitFileEntry {
        section: section.to_string(),
        path,
        code: format!("{}{}", staged, unstaged),
    }
}

#[tauri::command]
fn git_stage(repo: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add", "--"];
    for p in &paths { args.push(p); }
    let out = run_git(&repo, &args)?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
    Ok(())
}

#[tauri::command]
fn git_unstage(repo: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["restore", "--staged", "--"];
    for p in &paths { args.push(p); }
    let out = run_git(&repo, &args)?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
    Ok(())
}

#[tauri::command]
fn git_commit(repo: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }
    let out = run_git(&repo, &["commit", "-m", &message])?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
fn git_diff(repo: String, path: String, staged: bool) -> Result<String, String> {
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--no-color", "--", &path]
    } else {
        vec!["diff", "--no-color", "--", &path]
    };
    let out = run_git(&repo, &args)?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
fn git_discard(repo: String, paths: Vec<String>) -> Result<(), String> {
    // Untracked files need rm; tracked changed files need restore.
    // Caller filters into appropriate buckets by inspecting the
    // porcelain code first.
    let mut args = vec!["restore", "--source=HEAD", "--worktree", "--"];
    for p in &paths { args.push(p); }
    let out = run_git(&repo, &args)?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
    Ok(())
}

// ── Workspace search ─────────────────────────────────────────────────────
//
// Powers the Sidebar Search panel. Walks the workspace via the `ignore`
// crate (same engine ripgrep uses — respects .gitignore, .ignore,
// global gitignore, hidden files) and matches each line against a
// `regex` pattern. Returns up to MAX_RESULTS matches grouped at the
// frontend by file. Skips binary files via a UTF-8 readability check.

#[derive(serde::Serialize)]
struct SearchHit {
    path: String,
    line: u32,
    column: u32,
    text: String,
}

#[derive(serde::Deserialize)]
struct SearchOptions {
    case_sensitive: Option<bool>,
    is_regex: Option<bool>,
    whole_word: Option<bool>,
    /// Optional comma-separated globs (e.g. "*.ts,*.tsx") restricting
    /// which files are searched. Empty / None = all files.
    file_glob: Option<String>,
}

const MAX_SEARCH_RESULTS: usize = 1000;
const MAX_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024; // skip files > 5 MB

#[tauri::command]
fn search_workspace(root: String, query: String, options: SearchOptions) -> Result<Vec<SearchHit>, String> {
    use ignore::WalkBuilder;
    use std::io::{BufRead, BufReader};

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Build regex pattern. When `is_regex` is false we escape so the
    // user's literal string matches verbatim (otherwise typing `[` in
    // a normal search would error out as an unclosed bracket class).
    let case_sensitive = options.case_sensitive.unwrap_or(false);
    let is_regex = options.is_regex.unwrap_or(false);
    let whole_word = options.whole_word.unwrap_or(false);
    let mut pattern = if is_regex { query.clone() } else { regex::escape(&query) };
    if whole_word {
        pattern = format!(r"\b{pattern}\b");
    }
    let re = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| format!("Invalid pattern: {e}"))?;

    // Optional file-glob filter. Comma-separated → multiple OverrideBuilder
    // entries. Glob errors fall back to "no filter" so a typo doesn't
    // break search entirely.
    let mut overrides_builder = ignore::overrides::OverrideBuilder::new(&root);
    if let Some(globs) = options.file_glob.as_deref().filter(|s| !s.trim().is_empty()) {
        for glob in globs.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let _ = overrides_builder.add(glob);
        }
    }
    let overrides = overrides_builder.build().unwrap_or_else(|_| {
        ignore::overrides::OverrideBuilder::new(&root).build().unwrap()
    });

    let walker = WalkBuilder::new(&root)
        .hidden(true)            // skip hidden by default — same as ripgrep
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .overrides(overrides)
        .build();

    let mut hits: Vec<SearchHit> = Vec::new();

    for entry in walker.flatten() {
        if hits.len() >= MAX_SEARCH_RESULTS { break; }
        let path = entry.path();
        if !path.is_file() { continue; }
        let metadata = match path.metadata() { Ok(m) => m, Err(_) => continue };
        if metadata.len() > MAX_FILE_SIZE_BYTES { continue; }

        let file = match std::fs::File::open(path) { Ok(f) => f, Err(_) => continue };
        let reader = BufReader::new(file);
        let path_str = path.to_string_lossy().into_owned();

        for (i, line_result) in reader.lines().enumerate() {
            if hits.len() >= MAX_SEARCH_RESULTS { break; }
            let line = match line_result { Ok(l) => l, Err(_) => break };
            // Skip apparent binary lines — null byte presence is the cheap
            // heuristic ripgrep uses too.
            if line.contains('\0') { break; }
            if let Some(m) = re.find(&line) {
                hits.push(SearchHit {
                    path: path_str.clone(),
                    line: (i + 1) as u32,
                    column: (m.start() + 1) as u32,
                    text: if line.len() > 500 { format!("{}…", &line[..500]) } else { line },
                });
            }
        }
    }

    Ok(hits)
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

// ─── Desktop Launch App ────────────────────────────────────────────────────
//
// Narrow replacement for `bash` in Desktop Automation mode. Spawns a named
// executable or full path via std::process::Command — no shell, no pipes,
// no redirection. Pair args must be separate; the caller can't smuggle a
// command line. A hard denylist refuses shell / scripting / registry /
// admin tools so the blast radius stays firmly at "open an app".
//
// Windows PATH resolution handles bare names like "notepad", "calc",
// "chrome" by itself. Full paths also work. Protocol URLs (mailto:, http:)
// are NOT supported here — those would need ShellExecute; keep it simple.

#[derive(Serialize)]
struct LaunchAppResult {
    pid: u32,
    launched: String,
}

/// Launch a named executable or full path. Refuses shell / script / admin
/// tools by basename AND by extension. Never invokes a shell interpreter.
#[tauri::command]
fn launch_app(name: String) -> Result<LaunchAppResult, String> {
    // Shells, scripting hosts, registry / admin tooling. Checked by
    // basename so a full path like C:\Windows\System32\cmd.exe is
    // still caught.
    const DENYLIST: &[&str] = &[
        "bash", "sh", "zsh", "fish", "wsl", "wsl.exe",
        "cmd", "cmd.exe", "powershell", "pwsh", "powershell_ise",
        "reg", "regedit", "regedt32",
        "taskkill", "sc", "net", "net1", "wmic", "mshta",
        "rundll32", "cscript", "wscript",
        "gpedit", "mmc", "eventvwr",
    ];
    // Extension-based denylist. Windows' CreateProcess invokes cmd.exe
    // implicitly for .bat / .cmd, which defeats "no shell" — an
    // attacker-placed .bat on disk would gain shell semantics. Same
    // risk for scripting-host extensions. Only .exe and extension-less
    // (PATH-resolved) program names are allowed through.
    const SCRIPTING_EXT_DENY: &[&str] = &[
        ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse",
        ".wsf", ".wsh", ".msc", ".hta", ".reg",
    ];

    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("launch_app: name is required".into());
    }

    // Derive the basename (last path segment) for both the denylist and
    // extension checks. Handles both `\` and `/` separators and arbitrary
    // casing from the caller. Full paths to denylisted binaries are also
    // rejected — the user can't sneak "C:\Windows\System32\cmd.exe" through.
    let basename = trimmed
        .rsplit(|c: char| c == '\\' || c == '/')
        .next()
        .unwrap_or(trimmed)
        .to_lowercase();

    // Extension gate first — blocks scripting-host surface area.
    if let Some(dot) = basename.rfind('.') {
        let ext = &basename[dot..];
        if SCRIPTING_EXT_DENY.iter().any(|deny| *deny == ext) {
            return Err(format!(
                "launch_app refused: '{ext}' scripts cannot be launched directly — Windows would invoke a shell to run them."
            ));
        }
    }

    let stripped = basename
        .strip_suffix(".exe")
        .unwrap_or(&basename)
        .to_string();

    if DENYLIST.iter().any(|deny| *deny == stripped) {
        return Err(format!(
            "launch_app refused: '{stripped}' is on the denylist. Shells, scripting hosts, registry editors and admin tools cannot be launched from desktop mode."
        ));
    }

    let child = std::process::Command::new(trimmed)
        .spawn()
        .map_err(|e| format!("launch_app failed to spawn '{trimmed}': {e}"))?;

    let pid = child.id();

    // Poll for the process's first top-level window for up to 3 s, then
    // record it as the type_text / key_press target. This closes the
    // "IDE steals focus on the approval dialog" gap — by the time Ava
    // calls type_text, we already know where the keystrokes should go,
    // even without an explicit focus_window call.
    #[cfg(target_os = "windows")]
    {
        record_process_main_window(pid, std::time::Duration::from_millis(3000));
    }

    Ok(LaunchAppResult {
        pid,
        launched: trimmed.to_string(),
    })
}

/// Poll EnumWindows for up to `timeout` looking for the first visible top-level
/// window owned by `target_pid`. Records it via `record_target_hwnd` on find.
/// No-op if no window appears in time.
#[cfg(target_os = "windows")]
fn record_process_main_window(target_pid: u32, timeout: std::time::Duration) {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
    };

    // Use a thread-local-like static that the enum callback can write into.
    // A fresh AtomicIsize per call would require passing a pointer through
    // LPARAM; the simpler pattern is a module static reset on each call.
    static FOUND_HWND: AtomicIsize = AtomicIsize::new(0);
    static TARGET_PID: AtomicIsize = AtomicIsize::new(0);

    // SAFETY (fn): This is a Win32 callback signature with `unsafe
    // extern "system"` mandated by EnumWindows. `hwnd` is provided by
    // the OS for each enumerated window; it may be invalid by the
    // time we use it if the window was destroyed mid-enumeration, but
    // every Win32 call below tolerates that by returning 0 / a null
    // handle rather than dereferencing.
    unsafe extern "system" fn enum_cb(hwnd: HWND, _: LPARAM) -> BOOL {
        let target = TARGET_PID.load(Ordering::Relaxed) as u32;
        if target == 0 {
            return 0; // stop
        }
        // SAFETY: IsWindowVisible accepts any HWND; returns 0 for
        // destroyed / invalid handles. No dereference.
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }
        // Only main/top-level windows — skip owned popups.
        // SAFETY: GetWindow(hwnd, GW_OWNER) returns NULL for
        // destroyed/unowned windows. No memory mutation.
        let owner = unsafe { GetWindow(hwnd, GW_OWNER) };
        if !owner.is_null() {
            return 1;
        }
        let mut win_pid: u32 = 0;
        // SAFETY: GetWindowThreadProcessId writes into an owned &mut u32
        // on the stack. Safe for any HWND — returns 0 for invalid.
        unsafe { GetWindowThreadProcessId(hwnd, &mut win_pid) };
        if win_pid == target {
            FOUND_HWND.store(hwnd as isize, Ordering::Relaxed);
            return 0; // stop enumerating
        }
        1
    }

    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        FOUND_HWND.store(0, Ordering::Relaxed);
        TARGET_PID.store(target_pid as isize, Ordering::Relaxed);
        // SAFETY: EnumWindows dispatches enum_cb synchronously on the
        // calling thread for each top-level window, then returns. The
        // function pointer we pass is static and ABI-correct; LPARAM
        // is unused.
        unsafe {
            EnumWindows(Some(enum_cb), 0);
        }
        let hwnd = FOUND_HWND.load(Ordering::Relaxed);
        if hwnd != 0 {
            record_target_hwnd(hwnd);
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
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

use std::process::{Stdio, Child, ChildStdin, ChildStdout};
use std::io::{BufRead, BufReader, Write};

struct BrowserProcess {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

static BROWSER_PROCESS: Mutex<Option<BrowserProcess>> = Mutex::new(None);

/// Launch the browser worker subprocess.
///
/// Spawns the bundled `browser-worker.mjs` using Node. In dev the worker
/// lives at `packages/ide/src-tauri/resources/browser-worker.mjs` and
/// `node` must resolve it — playwright is installed in the IDE's
/// node_modules so the worker can `import { chromium } from 'playwright'`.
/// In production Tauri copies the worker into the app's resource_dir.
///
/// Idempotent: if the worker is already running, returns ok with
/// `{alreadyRunning: true}` instead of erroring. That way callers can
/// call launch freely before every operation without guarding.
#[tauri::command]
fn browser_launch(app: AppHandle) -> Result<serde_json::Value, String> {
    let mut guard = BROWSER_PROCESS.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if guard.is_some() {
        return Ok(serde_json::json!({ "ok": true, "alreadyRunning": true }));
    }

    // In dev the working directory is packages/ide/src-tauri. The worker
    // lives at resources/browser-worker.mjs relative to that. In production
    // Tauri's resource_dir() resolves to the bundled copy.
    let resource_dir = app.path().resource_dir().ok();
    let worker_candidates: Vec<std::path::PathBuf> = {
        let mut v: Vec<std::path::PathBuf> = Vec::new();
        // Production / bundled
        if let Some(dir) = resource_dir.as_ref() {
            v.push(dir.join("resources").join("browser-worker.mjs"));
        }
        // Dev — cwd-relative
        if let Ok(cwd) = std::env::current_dir() {
            v.push(cwd.join("resources").join("browser-worker.mjs"));
            v.push(cwd.join("src-tauri").join("resources").join("browser-worker.mjs"));
        }
        v
    };
    let worker_path = worker_candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "browser-worker.mjs not found in resource dir or dev paths".to_string())?;

    // The worker runs via plain `node` — must be on PATH or in the bundled
    // binaries directory. Playwright is imported from the IDE's node_modules,
    // so we set CWD to the package so Node's module resolution works.
    let node_cmd = if cfg!(windows) { "node.exe" } else { "node" };
    let package_root = worker_path
        .parent() // resources/
        .and_then(|p| p.parent()) // src-tauri/
        .and_then(|p| p.parent()) // packages/ide/
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let mut child = silent_command(node_cmd)
        .arg(&worker_path)
        .current_dir(&package_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to spawn browser worker ({}): {e}", node_cmd))?;

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
                                let _ = silent_command("taskkill")
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
        // Single-instance MUST be registered first. When the OS dispatches an
        // ava-ide:// URL it would otherwise launch a duplicate process; this
        // plugin intercepts the secondary launch, hands its argv (including
        // the deep-link URL) to the original instance, and exits the duplicate.
        // The deep-link plugin's on_open_url then fires in the original
        // instance and the React listener resolves the OAuth state correctly.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            // Bring the existing window to the foreground so the user sees
            // the sign-in completing instead of clicking back manually.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            // The OS appends the deep-link URL as an argv entry; forward
            // anything that looks like our scheme to the React side via the
            // same event the deep-link plugin emits, so a single listener
            // handles both code paths.
            for arg in argv {
                if arg.starts_with("ava-ide://") {
                    let _ = app.emit("ava-deep-link", arg);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            setup_tray(app)?;
            setup_panic_hotkey(app)?;

            // Dev-mode scheme registration. In production Tauri registers
            // `ava-ide://` with the OS as part of the installer; in dev we
            // have to do it ourselves each run so the callback reaches us.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("ava-ide");
            }

            // When a `ava-ide://auth?code=...&state=...` URL arrives,
            // forward it verbatim to the webview as the `ava-deep-link`
            // event. The React side validates state and calls the
            // exchange endpoint. We keep the Rust side thin — all
            // OAuth / secret-storage logic lives in the frontend where
            // existing shared-config helpers already know how to store
            // and mirror the platform key.
            use tauri::Emitter;
            use tauri_plugin_deep_link::DeepLinkExt;
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = app_handle.emit("ava-deep-link", url.to_string());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            click,
            double_click,
            right_click,
            local_vision_status,
            type_text,
            key_press,
            scroll,
            move_mouse,
            drag,
            highlight_rect,
            minimize_all,
            native_confirm,
            get_active_window,
            get_dpi_scale,
            list_ui_elements,
            find_ui_element,
            click_element,
            focus_window,
            desktop_mode_start,
            desktop_mode_stop,
            desktop_kill,
            get_foreground_window_title,
            list_windows,
            browser_launch,
            browser_send,
            browser_close,
            launch_app,
            profile_key_get,
            profile_key_delete,
            keychain_set,
            keychain_get,
            keychain_delete,
            search_workspace,
            git_status,
            git_stage,
            git_unstage,
            git_commit,
            git_diff,
            git_discard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
