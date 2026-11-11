// Generated from src-tauri/src/harbor_lan.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type HarborIdentity = { id: string, name: string, platform: string, version: string, };

export type HarborInstance = { id: string, name: string, host: string, port: number, platform: string, version: string, commandable: boolean, theme: string | null, isSelf: boolean, };
