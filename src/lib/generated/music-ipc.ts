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

export type MusicCatalogItem = { "kind": "track" } & MusicTrackCore | { "kind": "album" } & MusicAlbumRef | { "kind": "artist" } & MusicArtistRef | { "kind": "playlist" } & MusicPlaylistRef | { "kind": "station" } & MusicStationRef;

export type MusicCatalogPage = { items: Array<MusicCatalogItem>, nextCursor: string | null, total: number | null, scope: MusicCatalogScope, };

export type MusicCatalogRow = { id: string, title: string, titleLiteral: boolean, subtitle: string | null, layout: MusicRowLayout, source: string, items: Array<MusicCatalogItem>, };

export type MusicSearchResults = { top: MusicCatalogItem | null, tracks: Array<MusicTrackCore>, albums: Array<MusicAlbumRef>, artists: Array<MusicArtistRef>, playlists: Array<MusicPlaylistRef>, };

export type MusicVideoPage = { tracks: Array<MusicTrackCore>, next: string | null, };

export type MusicAlbum = { id: number, title: string, artist: string, artwork: string, trackCount: number, };

export type MusicArtist = { id: number, name: string, trackCount: number, albumCount: number, };

export type MusicPlaylist = { id: string, name: string, createdAt: string, updatedAt: string, tracks: Array<MusicTrackCore>, trackAddedAt: { [key in string]: string }, };

export type FilterType = "peak" | "lowShelf" | "highShelf" | "lowPass" | "highPass" | "notch";

export type PeqFilter = { type: FilterType, frequency: number, gain: number, q: number, enabled: boolean, };

export type MusicAudioSettings = { device: string, eqEnabled: boolean, eqBands: [number, number, number, number, number, number, number, number, number, number], boostEnabled: boolean, volumeLimit: number, balance: number, autoHeadroom: boolean, equipmentLabel: string, replayGain: "off" | "track" | "album", eqMode: "graphic" | "parametric", peqFilters: Array<PeqFilter>, eqStrength: number, preampDb: number, crossfeed: number, dspBypass: boolean, exclusive: boolean, sampleRate: number, speed: number, keepPitch: boolean, reverb: number, pitch: number, broadcastEnabled: boolean, broadcastDevice: string, };

export type MusicFxKind = "off" | "echo" | "delay" | "spiral" | "wide";

export type MusicFx = { kind: MusicFxKind, depth: number, beats: number, bpm: number, };

export type CableStatus = { supported: boolean, active: boolean, backend: string, sinkName: string, monitorName: string, monitorLabel: string, micName: string, micLabel: string, micReady: boolean, monitorReady: boolean, spec: string | null, rate: number | null, format: string | null, channels: number | null, requestedRate: number | null, graphRate: number | null, bitPerfect: boolean, resampledBy: string | null, outputDevice: string | null, detail: string | null, };

export type LastFmAuthStart = { token: string, authUrl: string, };

export type LastFmSession = { username: string, sessionKey: string, };

export type LastFmStatus = { connected: boolean, username: string | null, };

export type SpotifyStatus = { connected: boolean, username: string | null, country: string | null, premium: boolean, accountType: string | null, error: string | null, };

export type SpotifyDevice = { id: string, name: string, kind: string, active: boolean, restricted: boolean, volumePercent: number | null, };
