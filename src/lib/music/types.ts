import type {
  MusicAlbumRef,
  MusicArtistRef as GeneratedMusicArtistRef,
  MusicCatalogScope,
  MusicPlaylistRef,
  MusicRowLayout,
  MusicStationRef,
} from "@/lib/generated/music-ipc";

/** Measured file/stream properties; never infer these from a provider or subscription. */
export type MusicAudioQuality = {
  codec?: string;
  lossless?: boolean;
  sampleRateHz?: number;
  bitDepth?: number;
  bitrateKbps?: number;
};

export type MusicTrack = {
  releaseDate?: string;
  explicit?: boolean;
  version?: string;
  /** Original collection entry retained when the source chooser selects a provider. */
  /** Where the recording was asked for: the credit survives whichever source supplies audio. */
  collectionOrigin?: {
    id: string;
    connectorId?: string;
    title?: string;
    artist?: string;
    artwork?: string;
  };
  mediaKind?: "audio" | "video";
  connectorId?: string;
  sourceId?: string;
  playbackUrl?: string;
  quality?: MusicAudioQuality;
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  durationSeconds: number;
  durationLabel: string;
};

export type MusicSection = {
  id: string;
  title: string;
  subtitle: string;
  tracks: MusicTrack[];
  titleVars?: Record<string, string | number>;
};

export type MusicConnectorHealth = {
  id: string;
  name: string;
  health: "unknown" | "healthy" | "degraded" | "offline";
  searchable: boolean;
  playable: boolean;
  scrobbler: boolean;
};

export type MusicSourceCandidate = {
  connectorId: string;
  connectorName: string;
  health: MusicConnectorHealth["health"];
  track: MusicTrack;
};

export type SpotifyStatus = {
  connected: boolean;
  username?: string;
  country?: string;
  premium: boolean;
  error?: string;
};

export type MusicAlbum = {
  id: number;
  title: string;
  artist: string;
  artwork: string;
  trackCount: number;
};

export type MusicArtist = {
  id: number;
  name: string;
  trackCount: number;
  albumCount: number;
};

export type MusicPlaylist = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Collection-specific timestamps; older entries may have no recorded date. */
  trackAddedAt?: Record<string, string>;
  tracks: MusicTrack[];
};

export type MusicPlaybackPhase = "idle" | "resolving" | "playing" | "paused" | "error";

export type MusicPlayerState = {
  phase: MusicPlaybackPhase;
  current: MusicTrack | null;
  queue: MusicTrack[];
  queueIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  /** A scrobble is bookkeeping, not playback, so its failure must never read as a stuck track. */
  scrobbleError: string | null;
  likedIds: string[];
  likedTracks: MusicTrack[];
  recents: MusicTrack[];
};

export type {
  MusicAlbumRef,
  MusicPlaylistRef,
  MusicStationRef,
  MusicCatalogKind,
  MusicRowLayout,
  MusicConnectionKind,
  MusicConnectionStatus,
  MusicConnectionCapability,
  MusicConnectionField,
  MusicConnection,
} from "@/lib/generated/music-ipc";

/** Rust never sends musicBrainzId; the frontend adds it when it resolves an artist. */
export type MusicArtistRef = GeneratedMusicArtistRef & { musicBrainzId?: string };

export type MusicCatalogItem =
  | ({ kind: "track" } & MusicTrack)
  | ({ kind: "album" } & MusicAlbumRef)
  | ({ kind: "artist" } & MusicArtistRef)
  | ({ kind: "playlist" } & MusicPlaylistRef)
  | ({ kind: "station" } & MusicStationRef);

export type MusicCatalogPage = {
  items: MusicCatalogItem[];
  nextCursor: string | null;
  total?: number | null;
  /** A top/limited selection must not be presented as the artist's complete tracks. */
  scope: MusicCatalogScope;
};

export type MusicCatalogRow = {
  id: string;
  title: string;
  titleLiteral: boolean;
  subtitle?: string;
  layout: MusicRowLayout;
  source: string;
  items: MusicCatalogItem[];
};

export type MusicSearchResults = {
  top?: MusicCatalogItem;
  tracks: MusicTrack[];
  albums: MusicAlbumRef[];
  artists: MusicArtistRef[];
  playlists: MusicPlaylistRef[];
};
