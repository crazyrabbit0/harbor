use tauri::AppHandle;

#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
pub struct CastServerStatus {
    pub bundled: bool,
    pub running: bool,
    pub ready: bool,
    pub port: Option<u16>,
    pub last_error: Option<String>,
    pub restart_count: u32,
}

pub fn stop() {
    crate::torrent_engine::stop_lan_server();
}

// Only a stremio-server left in Harbor's own folder by older builds; a Stremio the user runs elsewhere is never touched.
fn is_harbor_sidecar(path: &std::path::Path, install_dir: &std::path::Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    name.starts_with("stremio-server")
        && path.parent().is_some_and(|dir| same_dir(dir, install_dir))
}

fn same_dir(a: &std::path::Path, b: &std::path::Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

fn install_dir() -> Option<std::path::PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(|p| p.to_path_buf())
}

fn kill_orphan_sidecars() {
    let Some(dir) = install_dir() else { return };
    #[cfg(windows)]
    for pid in windows_sidecars(&dir) {
        windows_terminate(pid);
    }
    #[cfg(not(windows))]
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let Ok(pid) = entry.file_name().to_string_lossy().parse::<i32>() else {
                continue;
            };
            if let Ok(exe) = std::fs::read_link(entry.path().join("exe")) {
                if is_harbor_sidecar(&exe, &dir) {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                }
            }
        }
    }
}

#[cfg(windows)]
fn windows_sidecars(dir: &std::path::Path) -> Vec<u32> {
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[repr(C)]
    struct Entry {
        size: u32,
        usage: u32,
        pid: u32,
        heap: usize,
        module: u32,
        threads: u32,
        parent: u32,
        priority: i32,
        flags: u32,
        executable: [u16; 260],
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
        fn CloseHandle(handle: Handle) -> i32;
        fn QueryFullProcessImageNameW(
            handle: Handle,
            flags: u32,
            name: *mut u16,
            len: *mut u32,
        ) -> i32;
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
        fn Process32FirstW(snapshot: Handle, entry: *mut Entry) -> i32;
        fn Process32NextW(snapshot: Handle, entry: *mut Entry) -> i32;
    }
    let mut found = Vec::new();
    let snapshot = unsafe { CreateToolhelp32Snapshot(2, 0) };
    if snapshot.is_null() || snapshot as isize == -1 {
        return found;
    }
    let mut entry: Entry = unsafe { std::mem::zeroed() };
    entry.size = std::mem::size_of::<Entry>() as u32;
    let mut more = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while more {
        let len = entry.executable.iter().position(|&c| c == 0).unwrap_or(260);
        let name = String::from_utf16_lossy(&entry.executable[..len]).to_lowercase();
        if name.starts_with("stremio-server") {
            let handle = unsafe { OpenProcess(0x1000, 0, entry.pid) };
            if !handle.is_null() {
                let mut buf = vec![0u16; 32768];
                let mut size = buf.len() as u32;
                if unsafe { QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size) }
                    != 0
                {
                    let path =
                        std::path::PathBuf::from(String::from_utf16_lossy(&buf[..size as usize]));
                    if is_harbor_sidecar(&path, dir) {
                        found.push(entry.pid);
                    }
                }
                unsafe { CloseHandle(handle) };
            }
        }
        more = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    found
}

#[cfg(windows)]
fn windows_terminate(pid: u32) {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn TerminateProcess(handle: *mut c_void, code: u32) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    let handle = unsafe { OpenProcess(0x0001, 0, pid) };
    if handle.is_null() {
        return;
    }
    unsafe {
        TerminateProcess(handle, 1);
        CloseHandle(handle);
    }
}

pub fn ensure_started_on_setup(_app: &AppHandle) {
    std::thread::spawn(kill_orphan_sidecars);
}

#[tauri::command]
pub async fn stop_stremio_sidecar() {
    let _ = tauri::async_runtime::spawn_blocking(kill_orphan_sidecars).await;
}

#[tauri::command]
pub fn cast_server_status() -> CastServerStatus {
    let (running, port, last_error) = crate::torrent_engine::lan_status();
    CastServerStatus {
        bundled: running,
        running,
        ready: running,
        port,
        last_error,
        restart_count: 0,
    }
}

#[tauri::command]
pub async fn cast_server_restart(app: AppHandle) -> Result<(), String> {
    crate::torrent_engine::start_lan_server(&app)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn cast_server_stop() {
    crate::torrent_engine::stop_lan_server();
    let _ = tauri::async_runtime::spawn_blocking(kill_orphan_sidecars).await;
}

#[cfg(test)]
mod tests {
    use super::is_harbor_sidecar;
    use std::path::Path;

    #[test]
    fn only_a_stremio_server_in_harbors_folder_counts_as_a_sidecar() {
        let dir = Path::new("C:/Program Files/Harbor");
        assert!(is_harbor_sidecar(&dir.join("stremio-server.exe"), dir));
        assert!(is_harbor_sidecar(
            &dir.join("Stremio-Server-x86_64.exe"),
            dir
        ));
        assert!(!is_harbor_sidecar(
            Path::new("C:/Stremio/stremio-server.exe"),
            dir
        ));
        assert!(!is_harbor_sidecar(&dir.join("harbor.exe"), dir));
        assert!(!is_harbor_sidecar(&dir.join("sub/stremio-server.exe"), dir));
    }
}
