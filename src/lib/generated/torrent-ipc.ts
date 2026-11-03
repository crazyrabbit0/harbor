// Generated from src-tauri/src/torrent_engine.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type EngineStatus = { ready: boolean, port: number | null, active_torrents: number, last_error: string | null, dht_tier: number, dht_nodes: number, };

export type EngineFile = { idx: number, name: string, length: number, };

export type AddResult = { info_hash: string, files: Array<EngineFile>, stream_base: string, already_managed: boolean, };

export type TorrentEngineStats = { peers: number, unchoked: number, downloaded: number, downloadSpeed: number, streamProgress: number, streamLen: number, peerSearchRunning: boolean, finished: boolean, state: string, };

export type TorrentListItem = { infoHash: string, name: string, downloaded: number, total: number, downloadSpeed: number, finished: boolean, paused: boolean, state: string, };

export type SelfTestStep = { label: string, ok: boolean, warn: boolean, detail: string, };

export type SelfTestResult = { pass: boolean, steps: Array<SelfTestStep>, };
