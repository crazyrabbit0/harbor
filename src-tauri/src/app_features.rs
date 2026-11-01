//! Optional subsystems compiled into this build, so the frontend hides rooms whose commands are missing.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
pub struct AppFeatures {
    pub games: bool,
    pub music: bool,
}

pub const FEATURES: AppFeatures = AppFeatures {
    games: cfg!(all(desktop, feature = "games")),
    music: cfg!(all(desktop, feature = "music")),
};

#[tauri::command]
pub fn app_features() -> AppFeatures {
    FEATURES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        crate::ipc_bindings::check("app-ipc.ts", "app_features.rs", &[AppFeatures::decl(&cfg)]);
    }
}
