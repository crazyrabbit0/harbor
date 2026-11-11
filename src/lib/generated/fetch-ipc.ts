// Generated from src-tauri/src/fetch_ipc.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type HarborFetchArgs = { url: string, method?: string, headers?: { [key in string]: string }, body?: string, bodyBase64?: string, timeoutMs?: number, responseType?: "base64", maxResponseBytes?: number, credentialHandle?: string, publicNetworkOnly?: boolean, allowLocalNetwork?: boolean, followRedirects?: boolean, thumbWidthPx?: number, };

export type HarborFetchResponse = { status: number, ok: boolean, body: string, contentType: string | null, headers: { [key in string]: string }, url: string | null, };

export type HarborUploadArgs = { url: string, field: string, filename: string, contentType?: string, dataBase64: string, headers?: { [key in string]: string }, timeoutMs?: number, };
