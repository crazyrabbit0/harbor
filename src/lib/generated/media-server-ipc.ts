// Generated from src-tauri/src/media_server.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type MediaServerRequestArgs = { origin: string, url: string, method?: string, headers?: { [key in string]: string }, body?: string, timeoutMs?: number, };

export type MediaServerResponse = { status: number, headers: { [key in string]: string }, body: string, };
