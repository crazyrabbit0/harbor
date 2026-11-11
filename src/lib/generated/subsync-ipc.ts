// Generated from src-tauri/src/subsync/mod.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type SyncOut = { offsetSec: number, ratio: number, confidence: number, fitWindowIds: Array<string>, };

export type AsrToken = { text: string, t0: number, t1: number, p: number, };

export type AsrWindow = { startSec: number, lenSec: number, lang: string, tokens: Array<AsrToken>, };

export type AlignmentQuality = { ncc: number, coverage: number, z: number, };

export type ScoredWindow = { id: string, fromSec: number, toSec: number, };

export type ScoredAlignmentQuality = { ncc: number, coverage: number, z: number, windowIds: Array<string>, windows: Array<ScoredWindow>, provenance: string, requestProvenance: string | null, };

export type PreflightCandidateScore = { id: string, invalid: boolean, identity: AlignmentQuality | null, best: AlignmentQuality | null, offsetSec: number | null, ratio: number | null, windowIds: Array<string>, provenance: string, };
