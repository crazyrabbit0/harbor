// Generated from src-tauri/music/src/model.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type MusicConnectionKind = "streaming" | "server" | "local" | "scrobbler" | "catalog";

export type MusicConnectionStatus = "connected" | "disconnected" | "error" | "unavailable";

export type MusicConnectionCapability = "search" | "browse" | "play" | "library" | "scrobble";

export type MusicAlbumRef = { id: string, connectorId: string, title: string, artist: string, artwork: string, year?: number | null, trackCount?: number | null, explicit?: boolean | null, };

export type MusicArtistRef = { id: string, connectorId: string, name: string, artwork?: string | null, subtitle?: string | null, };

export type MusicPlaylistRef = { id: string, connectorId: string, name: string, artwork: Array<string>, trackCount?: number | null, subtitle?: string | null, };

export type MusicStationRef = { id: string, connectorId: string, name: string, artwork: string, subtitle?: string | null, };

export type MusicCatalogKind = "tracks" | "albums";

export type MusicCatalogScope = "catalog" | "top" | "limited";

export type MusicRowLayout = "covers" | "circles" | "trackGrid" | "wide";

export type MusicConnectionField = { key: string, label: string, kind: "text" | "password" | "url" | "folder", placeholder?: string | null, required: boolean, };

export type MusicConnection = { id: string, name: string, kind: MusicConnectionKind, status: MusicConnectionStatus, account?: string | null, detail?: string | null, error?: string | null, capabilities: MusicConnectionCapability[], needs: Array<MusicConnectionField>, anonymous: boolean, };

export type MusicTrackCore = { explicit?: boolean | null, version?: string | null, mediaKind?: "audio" | "video", id: string, connectorId?: string | null, sourceId?: string | null, playbackUrl?: string | null, title: string, artist: string, album?: string | null, artwork: string, durationSeconds: number, durationLabel: string, };

export type MusicConnectorHealthState = "unknown" | "healthy" | "degraded" | "offline";

export type MusicConnectorHealth = { id: string, name: string, health: MusicConnectorHealthState, searchable: boolean, playable: boolean, scrobbler: boolean, };

export type MusicSourceCandidate = { connectorId: string, connectorName: string, health: MusicConnectorHealthState, track: MusicTrackCore, };

export type MusicVideoStream = { url: string, audioUrl: string | null, httpHeaders?: Record<string, string>, };

export type MusicMigration = { likedIds: Array<string> | null, recents: Array<MusicTrackCore> | null, queue: Array<MusicTrackCore> | null, };

export type MusicBootstrap = { likedIds: Array<string>, likedTracks: Array<MusicTrackCore>, recents: Array<MusicTrackCore>, queue: Array<MusicTrackCore>, };
