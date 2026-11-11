// Generated from src-tauri/music/src/broadcast.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type VirtualAudioDevice = { name: string, description: string, kind: string, product: string, };

export type BroadcastTargets = { devices: Array<VirtualAudioDevice>, installProduct: string, installUrl: string, };

export type BroadcastStatus = { active: boolean, device: string | null, product: string | null, trackId: string | null, driftMs: number | null, };

export type MusicDeckState = { deck: number, live: boolean, paused: boolean, trackId: string | null, connectorId: string | null, positionSeconds: number | null, durationSeconds: number | null, volume: number, gain: number, };

export type MusicDeckSnapshot = { decks: Array<MusicDeckState>, primary: number, };
