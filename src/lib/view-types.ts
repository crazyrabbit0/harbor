// Navigation and playback types shared by views, the player and lib/ modules; lib/view.tsx re-exports them.
import type { Meta } from "./cinemeta";
import type { PeopleDept, RankSource } from "./harbor-rank";
import type { StreamingService } from "./settings";
import type { SportsGame } from "./sports/espn";
import type { EsportsMatch } from "./sports/esports-feeds";
import type { SubtitleLoadMetadata } from "./subtitles/types";

export type View =
  | "home"
  | "settings"
  | "anime"
  | "discover"
  | "catalogs"
  | "plugins"
  | "addons"
  | "calendar"
  | "movies"
  | "shows"
  | "music"
  | "games"
  | "kids"
  | "library"
  | "collections-hub"
  | "live"
  | "sports"
  | "vod"
  | "downloads"
  | "wrapped"
  | "manga"
  | "ebook"
  | "people";

export type PlayEpisode = {
  season: number;
  episode: number;
  name?: string;
  imdbId?: string;
  imdbSeason?: number;
  imdbEpisode?: number;
  absoluteNumber?: number;
  tvdbEpisodeId?: number;
  kitsuStreamId?: string;
  sourceMetaId?: string;
  videoId?: string;
  still?: string;
  overview?: string;
  rating?: number;
  airDate?: string;
  runtime?: number;
};

/** Source identity stays separate from the provider coordinates used for episode details. */
export type EpisodeDetailPlayback = { meta: Meta; episode: PlayEpisode };

export type PlayerSrc = {
  /** true: corner preview; false: expanded preview (Back restores it); absent: regular player. */
  sportsDocked?: boolean;
  /** The video moved to its own window, so the player keeps the session but yields the page. */
  pipDocked?: boolean;
  /** Official provider iframe; handled separately from native/media stream playback. */
  officialBroadcast?: import("./sports/esports-streams").EsportsStream;
  meta: Meta;
  playbackTraceId?: string;
  proxySessionId?: string;
  historyUrl?: string;
  imdbId?: string;
  imdbIdVerified?: boolean;
  episode?: PlayEpisode;
  /** Last logical episode covered by the physical source. */
  episodeEnd?: number;
  episodeSpan?: import("./episode-span").EpisodeSpan;
  url: string;
  title: string;
  subtitle?: string;
  notWebReady?: boolean;
  isAnime?: boolean;
  subtitles?: Array<{
    url: string;
    lang?: string;
    id?: string;
    /** The path came from the user's local library or a configured home server, not an addon. */
    trustedSource?: boolean;
  }>;
  subtitlePreselect?: {
    off: boolean;
    url?: string;
    lang?: string;
    title?: string;
    metadata?: SubtitleLoadMetadata;
  };
  attempt?: number;
  autoFired?: boolean;
  resume?: boolean;
  startFromZero?: boolean;
  streamRef?: PlayerStreamRef;
  liveProgram?: string;
  isLive?: boolean;
  headers?: Record<string, string>;
  homeServer?: {
    connectionId: string;
    itemId: string;
    versionId: string;
    quality: import("./media-server/types").MediaServerQuality;
    playbackSessionId?: string;
  };
  startPositionMs?: number;
  startPaused?: boolean;
};

export type PlayerStreamRef = {
  /** Exact media filename selected after local/torrent/debrid resolution. */
  resolvedFilename?: string | null;
  infoHash?: string | null;
  fileIdx?: number | null;
  addonId?: string | null;
  title?: string | null;
  parsedTitle?: string | null;
  resolution?: string | null;
  quality?: string | null;
  releaseGroup?: string | null;
  source?: string | null;
  size?: number | null;
  bingeGroup?: string | null;
  cachedSlugs?: string[];
};

export type GridSpec = {
  title: string;
  fetcher: (page: number, loaded?: number) => Promise<Meta[]>;
  initial?: Meta[];
  /** Last complete page in initial; use 0 for a capped/filtered row preview. */
  initialPage?: number;
  kidsHero?: { grad: string; art: string; name: string };
};

export type MetaFilter =
  | { kind: "year"; mediaType: "movie" | "tv"; value: number }
  | { kind: "runtime"; mediaType: "movie" | "tv"; value: number }
  | { kind: "genre"; mediaType: "movie" | "tv"; name: string; id: number }
  | { kind: "studio"; mediaType: "movie" | "tv"; name: string; id: number }
  | { kind: "country"; mediaType: "movie" | "tv"; name: string; iso: string }
  | { kind: "language"; mediaType: "movie" | "tv"; name: string; iso: string }
  | { kind: "network"; mediaType: "movie" | "tv"; name: string; id: number };

export type Frame =
  | { kind: "home" }
  | { kind: "settings" }
  | { kind: "anime" }
  | { kind: "discover" }
  | { kind: "catalogs" }
  | { kind: "plugins" }
  | { kind: "addons" }
  | { kind: "addon-detail"; id: string }
  | { kind: "calendar" }
  | { kind: "wrapped" }
  | { kind: "queue" }
  | { kind: "movies" }
  | { kind: "shows" }
  | { kind: "music" }
  | { kind: "games" }
  | { kind: "kids" }
  | { kind: "library" }
  | { kind: "live" }
  | { kind: "sports"; esportsEvent?: EsportsMatch }
  | { kind: "vod" }
  | { kind: "downloads" }
  | { kind: "manga"; mangaId?: string }
  | { kind: "ebook"; ebookId?: string }
  | { kind: "people"; source?: RankSource; dept?: PeopleDept; focusSource?: boolean; nonce: number }
  | { kind: "service"; service: StreamingService }
  | {
      kind: "meta";
      meta: Meta;
      liveContext?: boolean;
      episodeHint?: { season: number; episode: number };
      seasonEntryId?: string;
    }
  | { kind: "addon-collection"; meta: Meta }
  | {
      kind: "episode-detail";
      seriesId: string;
      season: number;
      episode: number;
      seriesMeta?: Meta;
      playback?: EpisodeDetailPlayback;
    }
  | { kind: "person"; id: number }
  | { kind: "profile"; handle: string }
  | { kind: "feed" }
  | { kind: "groups" }
  | { kind: "group"; id: string }
  | { kind: "list"; handle: string; listId: string }
  | { kind: "collection"; id: number }
  | { kind: "collections" }
  | { kind: "collections-hub" }
  | { kind: "filter"; filter: MetaFilter }
  | { kind: "brands"; brand: "studio" | "network" }
  | { kind: "grid"; grid: GridSpec }
  | { kind: "award"; awardType: import("./providers/wikidata").AwardType }
  | { kind: "anime-award"; sourceId: import("./anime-awards").AwardSourceId }
  | { kind: "curated-list"; listId: string }
  | {
      kind: "picker";
      meta: Meta;
      episode?: PlayEpisode;
      autoPlay?: boolean;
      attempt?: number;
      intent?: "play" | "download";
      seasonEpisodes?: PlayEpisode[];
      resume?: boolean;
    }
  | { kind: "player"; src: PlayerSrc }
  | { kind: "match-detail"; game: SportsGame; eventGames?: SportsGame[] };
