//! Small helpers shared by the Harbor app crate and its subsystem crates.
pub mod app_hooks;
pub mod asset_scope;
pub mod binary_lookup;
pub mod browser_args;
pub mod cast_hooks;
pub mod cast_types;
pub mod child_pipe;
pub mod child_window;
pub mod fetch;
pub mod ipc_bindings;
pub mod lan;
#[cfg(feature = "mpv")]
pub mod mpv;
pub mod net_guard;
pub mod proc_guard;
pub mod shutdown;
