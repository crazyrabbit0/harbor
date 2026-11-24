import type {
  AudioCodec,
  AudioInfo,
  Codec,
  Container,
  Contributor,
  DebridSlug,
  HdrFormat,
  ParsedStream as CoreParsedStream,
  Resolution,
  ScoreReason,
  ScoredStream as CoreScoredStream,
  Source,
  Stream as CoreStream,
  StreamSubtitle,
  Tier,
} from "@/lib/generated/streams-ipc";

// The stream types come from harbor-core, so the Rust ranking and this TypeScript fallback share one shape.
export type {
  AudioCodec,
  AudioInfo,
  Codec,
  Container,
  Contributor,
  DebridSlug,
  HdrFormat,
  Resolution,
  ScoreReason,
  Source,
  StreamSubtitle,
  Tier,
};

export type ProxyHeaders = {
  request?: Record<string, string>;
  response?: Record<string, string>;
};

// Fields harbor-core keeps in its catch-all map: Rust passes them through without reading them.
type StreamExtras = {
  fileMustInclude?: string;
  nzbUrl?: string;
  servers?: string[];
  rarUrls?: string[];
  zipUrls?: string[];
  tarUrls?: string[];
  tgzUrls?: string[];
  sevenZipUrls?: string[];
  behaviorHints?: {
    bingeGroup?: string;
    videoHash?: string;
    videoSize?: number;
    filename?: string;
    fileName?: string;
    countryWhitelist?: string[];
    notWebReady?: boolean;
    proxyHeaders?: ProxyHeaders;
    headers?: Record<string, string>;
  } & Record<string, unknown>;
  liveStreamCheck?: boolean;
  addonUrl?: string;
  addonRanked?: boolean;
};

export type Stream = Omit<CoreStream, "behaviorHints"> & StreamExtras;

type StreamOwnKeys = keyof CoreStream;

export type ParsedStream = Stream &
  Omit<CoreParsedStream, StreamOwnKeys> & {
    cacheVerified: Partial<Record<DebridSlug, boolean>>;
  };

export type ScoredStream = ParsedStream &
  Pick<CoreScoredStream, "score" | "reasons" | "tier"> & {
    nativeIdx?: number;
    nameAbsent?: boolean;
  };

export type RankedPicker = {
  primary: ScoredStream | null;
  byTier: Partial<Record<Tier, ScoredStream>>;
  all: ScoredStream[];
};
