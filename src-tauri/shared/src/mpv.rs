//! libmpv helpers the app and the music crate both use.
use std::ffi::CString;

use libmpv2::Mpv;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct AudioDevice {
    pub name: String,
    pub description: String,
}

pub fn mpv_argv_command(mpv: &Mpv, argv: &[&str]) -> Result<(), String> {
    let cstrings: Vec<CString> = argv
        .iter()
        .map(|s| CString::new(*s).map_err(|e| format!("cstring: {}", e)))
        .collect::<Result<Vec<_>, _>>()?;
    let mut ptrs: Vec<*const std::os::raw::c_char> = cstrings.iter().map(|c| c.as_ptr()).collect();
    ptrs.push(std::ptr::null());
    let rc = unsafe { libmpv2_sys::mpv_command(mpv.ctx.as_ptr(), ptrs.as_mut_ptr()) };
    if rc < 0 {
        return Err(format!("mpv_command rc={}", rc));
    }
    Ok(())
}
