//! Positions a native child window inside the main window from a CSS rect the page measured.

#[cfg(windows)]
fn client_scale(parent: isize, css_view_w: f64, css_view_h: f64) -> (f64, f64, i32, i32) {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::GetClientRect;
    let mut rc = RECT::default();
    let ok = unsafe { GetClientRect(HWND(parent as *mut _), &mut rc).is_ok() };
    let (cw, ch) = (rc.right, rc.bottom);
    if ok && cw > 0 && ch > 0 && css_view_w > 0.5 && css_view_h > 0.5 {
        (cw as f64 / css_view_w, ch as f64 / css_view_h, cw, ch)
    } else {
        (1.0, 1.0, 0, 0)
    }
}

#[cfg(not(windows))]
fn client_scale(_parent: isize, _css_view_w: f64, _css_view_h: f64) -> (f64, f64, i32, i32) {
    (1.0, 1.0, 0, 0)
}

pub fn css_to_physical(
    parent: isize,
    css_left: f64,
    css_top: f64,
    css_width: f64,
    css_height: f64,
    css_view_w: f64,
    css_view_h: f64,
) -> (i32, i32, i32, i32) {
    let (sx, sy, cw, ch) = client_scale(parent, css_view_w, css_view_h);
    let mut x = (css_left * sx).round() as i32;
    let mut y = (css_top * sy).round() as i32;
    let mut w = (css_width * sx).round().max(1.0) as i32;
    let mut h = (css_height * sy).round().max(1.0) as i32;
    if x.abs() <= 2 {
        w += x;
        x = 0;
    }
    if y.abs() <= 2 {
        h += y;
        y = 0;
    }
    if cw > 0 && ((x + w - cw).abs() <= 4 || css_left + css_width >= css_view_w - 2.0) {
        w = cw - x;
    }
    if ch > 0 && ((y + h - ch).abs() <= 4 || css_top + css_height >= css_view_h - 2.0) {
        h = ch - y;
    }
    (x, y, w.max(1), h.max(1))
}

#[cfg(windows)]
pub fn place_child(hwnd_raw: isize, _parent_raw: isize, x: i32, y: i32, w: i32, h: i32) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOP, SWP_NOACTIVATE};
    let hwnd = HWND(hwnd_raw as *mut _);
    let w = w.max(1);
    let h = h.max(1);
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOP), x, y, w, h, SWP_NOACTIVATE);
        let rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, 18, 18);
        if !rgn.is_invalid() {
            let _ = SetWindowRgn(hwnd, Some(rgn), true);
        }
    }
}

#[cfg(not(windows))]
pub fn place_child(_hwnd_raw: isize, _parent_raw: isize, _x: i32, _y: i32, _w: i32, _h: i32) {}
