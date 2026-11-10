// Generated from src-tauri/games/src/download_locations.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type SetupLocation = { path: string, label: string, availableBytes: number | null, };

export type SetupLocations = { drives: Array<SetupLocation>, selected: SetupLocation | null, };
