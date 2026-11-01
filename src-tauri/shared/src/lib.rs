//! Small helpers shared by the Harbor app crate and its subsystem crates.
pub mod app_hooks;
pub mod asset_scope;
pub mod browser_args;
pub mod child_pipe;
pub mod fetch;
#[cfg(feature = "mpv")]
pub mod mpv;
pub mod net_guard;
