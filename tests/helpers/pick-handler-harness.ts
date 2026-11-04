import * as linkReadiness from "../../src/lib/streams/link-readiness.ts";
import { hookHarness } from "./hook-harness.ts";

type Resolved = { ok: boolean; via?: string; data?: any; readiness?: any; code?: string };

/** Runs use-pick-handler with a scripted resolver; records opened players, history, proxies and preflights. */
export function pickHandlerHarness(
  options: {
    intent?: string;
    resolve?: () => Promise<Resolved>;
    redirect?: () => Promise<string>;
    preflight?: (url: string) => Promise<{ ok: boolean; reason?: string; sizeBytes?: number }>;
    p2pEligible?: boolean;
    preferP2pDownload?: boolean;
  } = {},
) {
  const opened: any[] = [],
    history: any[] = [],
    downloads: any[] = [],
    proxies: unknown[][] = [],
    preflights: string[] = [],
    resolving: unknown[] = [],
    failed: unknown[] = [],
    resolveCalls: unknown[][] = [];
  let lookups = 0;
  let redirect = options.redirect ?? (async () => "");
  const h = hookHarness("src/views/play-picker/use-pick-handler.ts", "usePickHandler", {
    "@/lib/debrid/playback-preparation": { invalidatePreparedDebridLink() {} },
    "@/lib/playback-history": { savePlayback: (_id: string, entry: any) => history.push(entry) },
    "@/lib/season-lock": { saveSeasonLock() {} },
    "@/lib/dead-streams": { markStreamDead() {}, recordStubEvent() {} },
    "@/lib/torrent/stremio-stream": { engineP2pEligible: () => options.p2pEligible === true },
    "@/lib/streams/cached": { hasUncachedMarker: () => false },
    "@/lib/streams/preflight": {
      preflightCheck: async (url: string) => {
        preflights.push(url);
        if (!options.preflight) throw new Error("unexpected preflight");
        return options.preflight(url);
      },
    },
    "@/lib/streams/link-readiness": linkReadiness,
    "@/lib/streams/resolve": {
      resolveStream: (...args: unknown[]) => {
        resolveCalls.push(args);
        return (options.resolve ?? (async () => ({ ok: false, code: "unset" })))();
      },
      shouldPreferP2pDownload: () => options.preferP2pDownload === true,
    },
    "@/lib/streams/playback-redirect": {
      resolvePlaybackRedirect: () => {
        lookups++;
        return redirect();
      },
    },
    "@/lib/perf/playback-trace": {
      beginPlaybackTrace: () => "fixture",
      finishPlaybackTrace() {},
      markPlaybackTrace() {},
    },
    "@/lib/stream-proxy": {
      registerStreamProxy: async (...args: unknown[]) => {
        proxies.push(args);
        return { url: "http://127.0.0.1:1/proxy", sessionId: "proxy-1" };
      },
      unregisterStreamProxy() {},
    },
    "@/lib/together/build-invite": { buildPlayInvite() {} },
    "@/lib/providers/kitsu": { parseKitsuId: () => null },
    "@/lib/streams/anime-identity-core": { splitFranchiseDisplaySeason: () => null },
    "@/lib/window": { openInAppBrowser() {}, openUrl() {} },
    "@/lib/download/downloads-store": {
      enqueueDownload: async (item: any) => downloads.push(item),
    },
    "@/lib/download/season-download": { downloadSeasonFromPack() {} },
    "@/lib/download/season-pack": { isDownloadableSeasonPack: () => false },
    "./picker-utils": {
      formatStreamQuality: () => "1080p",
      isDebridFailure: () => false,
      playError: (code: string) => ({ code }),
      streamIdentity: () => "fixture",
    },
  });
  const noop = () => {};
  const api = h.render({
    meta: { id: "tt100", name: "Fixture" },
    debrids: [],
    isCached: () => true,
    streamMode: "both",
    p2pAutoConsent: true,
    seasonLock: false,
    inSession: false,
    inviteSentRef: { current: null },
    openPlayer: (src: any) => opened.push(src),
    intent: options.intent ?? "play",
    autoActive: false,
    autoAttemptIdx: 0,
    autoCandidatesLength: 1,
    autoFiredRef: { current: false },
    setAutoAttemptIdx: noop,
    setAutoExhausted: noop,
    setFailedStreams: (next: (prev: Set<unknown>) => Set<unknown>) =>
      failed.push(...next(new Set())),
    setResolveError: noop,
    setResolving: (value: unknown) => resolving.push(value),
  });
  return {
    ...h,
    api,
    opened,
    history,
    downloads,
    proxies,
    preflights,
    resolving,
    failed,
    resolveCalls,
    get lookups() {
      return lookups;
    },
    redirect(fn: typeof redirect) {
      redirect = fn;
    },
  };
}
