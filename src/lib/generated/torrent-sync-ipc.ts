// Generated from src-tauri/src/subsync/torrent_sync.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type TorrentWindow = { startSec: number, lenSec: number, };

export type TorrentAvailability = { windows: Array<TorrentWindow>, headReady: boolean, tailReady: boolean, downloadedFrac: number, lateRegionReady: boolean, fileLen: number, };

export type TorrentSyncOut = { offsetSec: number, ratio: number, confidence: number, leverSec: number, windows: number, ratioLocked: boolean, fitWindowIds: Array<string>, };
