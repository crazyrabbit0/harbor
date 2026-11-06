import * as cwAnimeEpisode from "../../src/lib/cw-anime-episode.ts";
import * as animeIdentityCore from "../../src/lib/streams/anime-identity-core.ts";
import { hookHarness } from "./hook-harness.ts";

type Node = { type: unknown; props: Record<string, any> };

const KITSU_ID = /^kitsu:(\d+)/;

/** Renders the real ContinueCard with a mocked jsx runtime and records its navigation calls. */
export function continueCardHarness(
  options: {
    settings?: Record<string, unknown>;
    aniZip?: unknown;
    animeCwId?: (id: string) => string | null;
    episodes?: Array<{ episode: number; name?: string; still?: string }>;
  } = {},
) {
  const calls: Record<string, unknown[][]> = {
    openMeta: [],
    openPicker: [],
    openPlayer: [],
    resolveMeta: [],
    aniZip: [],
  };
  let authKey = "auth-a";
  const settings = {
    cwPreferEpisodeStill: false,
    liquidGlass: false,
    simklAnimeTitleLanguage: "en",
    tmdbKey: "",
    playbackSourcePreference: "online",
    preferredMediaServerId: null,
    ...options.settings,
  };
  const aniZip = (scheme: string) => async (id: number) => {
    calls.aniZip.push([scheme, id]);
    return options.aniZip ?? null;
  };
  const mocks = {
    "react/jsx-runtime": {
      jsx: (type: unknown, props: Record<string, any>) => ({ type, props }),
      jsxs: (type: unknown, props: Record<string, any>) => ({ type, props }),
      Fragment: "fragment",
    },
    "lucide-react": { Check: "Check", X: "X" },
    "@/components/icons/play-filled": { Play: "Play" },
    "@/assets/simkl.png": { default: "simkl.png" },
    "@/assets/trakt.svg": { default: "trakt.svg" },
    "@/lib/cinemeta": { narrowMediaType: (type: string) => type },
    "@/lib/meta-resource": {
      resolveMeta: (...args: unknown[]) => {
        calls.resolveMeta.push(args);
        return Promise.resolve(null);
      },
    },
    "@/lib/providers/anime-kitsu-addon": { animeKitsuMeta: async () => null },
    "@/lib/providers/tmdb/tmdb-lite": { tmdbLiteMeta: async () => null },
    "@/lib/providers/tmdb": { tmdbIdFromImdb: async () => null },
    "@/lib/context-menu": { useContextMenu: () => ({ open() {} }) },
    "@/lib/i18n": { useT: () => (key: string) => key },
    "@/lib/snapshots": { readSnapshot: () => undefined, useSnapshotVersion: () => 0 },
    "@/lib/read-at-version": { readAtVersion: (_v: unknown, read: () => unknown) => read() },
    "@/lib/stremio": {
      episodeFromVideoId: (id?: string) => {
        const parts = id?.split(":") ?? [];
        return parts.length === 3 ? { season: +parts[1], episode: +parts[2] } : null;
      },
      isAnimeCwItem: () => false,
      libraryMetaType: (type: string) => type,
    },
    "@/lib/new-episodes": { useHasNewEpisode: () => 0 },
    "@/views/detail/tooltip": { Tooltip: "Tooltip" },
    "@/lib/profiles": {
      useProfiles: () => ({ profiles: [], activeProfile: null }),
      sharesStremioStorage: () => false,
    },
    "@/lib/auth": { useAuth: () => ({ authKey }) },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) => select(settings),
    },
    "@/lib/use-now": { useNow: () => 0 },
    "@/lib/view": {
      useViewActions: () => ({
        openMeta: (...args: unknown[]) => calls.openMeta.push(args),
        openPicker: (...args: unknown[]) => calls.openPicker.push(args),
        openPlayer: (...args: unknown[]) => calls.openPlayer.push(args),
      }),
    },
    "@/lib/watched-by": { getWatchedBy: () => null },
    "@/lib/local-library/playback": { resolveLocalPlayVersions: () => [] },
    "@/lib/local-library/player-src": { localPlayerSrc: () => ({}) },
    "@/lib/player/local-versions-modal": { openLocalVersions: () => {} },
    "@/lib/media-server/connections": { mediaServerConnections: () => [] },
    "@/lib/media-server/index-store": { mediaServerItems: async () => [] },
    "@/lib/media-server/selectors": {
      matchingServerItems: () => [],
      serverPlayableCopies: () => [],
    },
    "@/lib/media-server/playback": {
      createMediaServerPlayerSrc: async () => ({}),
      decidePlaybackSource: () => ({ kind: "online" }),
    },
    "@/lib/series-episodes": { fetchSeasonEpisodes: async () => options.episodes ?? [] },
    "@/lib/providers/anizip": {
      aniZipByAnidb: aniZip("anidb"),
      aniZipByAnilist: aniZip("anilist"),
      aniZipByKitsu: aniZip("kitsu"),
      aniZipByMal: aniZip("mal"),
    },
    "@/lib/logo": { peekCachedLogo: () => undefined, resolveLogo: async () => undefined },
    "@/lib/anime-title": { resolvePreferredAnimeTitle: async () => null },
    "@/lib/providers/jikan": { stripFranchiseSuffix: (name: string) => name },
    "@/lib/anime-cw-ids": { getAnimeCwId: options.animeCwId ?? (() => null) },
    "@/lib/cw-anime-episode": cwAnimeEpisode,
    "@/lib/providers/anime-franchise-root": { isSplitFranchiseKitsu: () => false },
    "@/lib/providers/kitsu": {
      parseKitsuId: (id: string) => (KITSU_ID.test(id) ? Number(KITSU_ID.exec(id)![1]) : null),
    },
    "@/lib/streams/anime-identity-core": animeIdentityCore,
    "@/lib/subtitles/anime-numbering": { classifyAnimeNumbering: () => "seasonal" },
    "@/components/ThreeLiquidGlassSurface": { ThreeLiquidGlassSurface: "Glass" },
  };
  // Every observed card counts as on screen at once.
  class IntersectionObserver {
    cb: (entries: Array<{ isIntersecting: boolean }>) => void;
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ isIntersecting: true }]);
    }
    disconnect() {}
  }
  const card = hookHarness("src/components/continue-card.tsx", "ContinueCard", mocks, {
    IntersectionObserver,
  });
  const nodes = (tree: unknown, out: Node[] = []): Node[] => {
    if (Array.isArray(tree)) for (const child of tree) nodes(child, out);
    else if (tree && typeof tree === "object" && "props" in tree) {
      out.push(tree as Node);
      nodes((tree as Node).props.children, out);
    }
    return out;
  };
  return {
    calls,
    setAuthKey: (key: string) => {
      authKey = key;
    },
    render: (props: Record<string, unknown>) => card.render(props),
    nodes,
    buttons: (tree: unknown) => nodes(tree).filter((n) => n.type === "button"),
    image: (tree: unknown) => nodes(tree).find((n) => n.type === "img" && n.props.onError),
  };
}
