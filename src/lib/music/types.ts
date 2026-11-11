import type {
  MusicAlbumRef,
  MusicArtistRef as GeneratedMusicArtistRef,
  MusicCatalogPage as GeneratedMusicCatalogPage,
  MusicCatalogRow as GeneratedMusicCatalogRow,
  MusicPlaylist as GeneratedMusicPlaylist,
  MusicSearchResults as GeneratedMusicSearchResults,
  MusicSourceCandidate as GeneratedMusicSourceCandidate,
  MusicPlaylistRef,
  MusicStationRef,
  MusicTrackCore,
} from "@/lib/generated/music-ipc";

/** Measured file/stream properties; never infer these from a provider or subscription. */
export type MusicAudioQuality = {
  codec?: string;
  lossless?: boolean;
  sampleRateHz?: number;
  bitDepth?: number;
  bitrateKbps?: number;
};

/** Rust's track shape plus fields only the frontend sets. */
export type MusicTrack = MusicTrackCore & {
  releaseDate?: string;
  /** Where the recording was asked for: the credit survives whichever source supplies audio. */
  collectionOrigin?: {
    id: string;
    connectorId?: string | null;
    title?: string;
    artist?: string;
    artwork?: string;
  };
  quality?: MusicAudioQuality;
};

export type MusicSection = {
  id: string;
  title: string;
  subtitle: string;
  tracks: MusicTrack[];
  titleVars?: Record<string, string | number>;
};

export type { MusicConnectorHealth } from "@/lib/generated/music-ipc";

export type MusicSourceCandidate = Omit<GeneratedMusicSourceCandidate, "track"> & {
  track: MusicTrack;
};

export type { MusicAlbum, MusicArtist, SpotifyStatus } from "@/lib/generated/music-ipc";

export type MusicPlaylist = Omit<GeneratedMusicPlaylist, "tracks"> & { tracks: MusicTrack[] };

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

export type MusicCatalogPage = Omit<GeneratedMusicCatalogPage, "items"> & {
  items: MusicCatalogItem[];
};

/** Rows built in the frontend may leave out the subtitle Rust always sends. */
export type MusicCatalogRow = Omit<GeneratedMusicCatalogRow, "items" | "subtitle"> & {
  subtitle?: string | null;
  items: MusicCatalogItem[];
};

export type MusicSearchResults = Omit<GeneratedMusicSearchResults, "top" | "tracks" | "artists"> & {
  top?: MusicCatalogItem | null;
  tracks: MusicTrack[];
  artists: MusicArtistRef[];
};
