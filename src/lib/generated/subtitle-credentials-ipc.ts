// Generated from src-tauri/src/subtitle_credentials.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type BindSubtitleCredentialArgs = { kind: "subsource-api-key" | "subdl-api-key", apiKey: string, };

export type SubtitleCredentialRef = { kind: "subsource-api-key" | "subdl-api-key", credentialId: string, };
