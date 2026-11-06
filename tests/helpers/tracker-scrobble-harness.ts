import "../_localstorage-stub.ts";
import * as simklPending from "../../src/lib/simkl/pending-sync.ts";
import { SIMKL_WATCHED_RATIO } from "../../src/lib/simkl/config.ts";
import { flushPromises, hookHarness } from "./hook-harness.ts";

export type Beacon = { action: string; keepalive: boolean | undefined; pct: number; url: string };
export type Scrobble = { action: string; pct: number };

type Playback = { status: string; sec: number; episode?: number; durationSec?: number };

function playerWindow(listeners: Map<string, () => void>) {
  return {
    addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
    removeEventListener: (name: string) => void listeners.delete(name),
    setInterval: () => 1,
    clearInterval: () => {},
  };
}

function episodeSource() {
  const episodes = new Map<number, { season: number; episode: number }>();
  return (episode: number) => {
    if (!episodes.has(episode)) episodes.set(episode, { season: 1, episode });
    return {
      meta: { id: "tt9", name: "Show" },
      imdbId: "tt9",
      episode: episodes.get(episode),
    };
  };
}

function recordBeacon(beacons: Beacon[]) {
  return (url: string, init: { keepalive?: boolean; body: string }) => {
    const action = /\/scrobble\/(\w+)/.exec(url)?.[1] ?? "";
    beacons.push({ action, keepalive: init.keepalive, pct: JSON.parse(init.body).pct, url });
    return Promise.resolve();
  };
}

/** Runs `useSimklScrobble` on a scripted playback clock; the pending queue is the real one. */
export function simklScrobbleHarness() {
  localStorage.clear();
  let position = 0;
  const state = { historyOk: true };
  const scrobbles: Scrobble[] = [];
  const beacons: Beacon[] = [];
  const watched: unknown[][] = [];
  const listeners = new Map<string, () => void>();
  const sourceFor = episodeSource();
  const h = hookHarness(
    "src/lib/simkl/scrobble-hook.ts",
    "useSimklScrobble",
    {
      "./provider": { useSimkl: () => ({ isConnected: true }) },
      "./scrobble": {
        simklScrobble: async (action: string, _id: string, _ep: unknown, pct: number) => {
          scrobbles.push({ action, pct });
          return true;
        },
        buildBody: (_id: string, _ep: unknown, pct: number) => ({ pct }),
      },
      "./pending-sync": simklPending,
      "./record-watched": {
        recordWatchedFallback: async (...args: unknown[]) => (watched.push(args), state.historyOk),
      },
      "@/lib/player/playback-clock": {
        getPlaybackPosition: () => position,
        subscribePlaybackClock: () => () => {},
      },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => unknown) => pick({ simklScrobbleEnabled: true }),
      },
      "./config": {
        SIMKL_API_BASE: "https://api.simkl.test",
        SIMKL_APP_NAME: "harbor",
        SIMKL_APP_VERSION: "1",
        SIMKL_CLIENT_ID: "cid",
        SIMKL_USER_AGENT: "ua",
        SIMKL_WATCHED_RATIO,
      },
      "./session": { getSession: () => ({ accessToken: "token" }) },
    },
    { window: playerWindow(listeners), fetch: recordBeacon(beacons) },
  );
  return {
    state,
    scrobbles,
    beacons,
    watched,
    queue: simklPending.listPendingWatches,
    at({ status, sec, episode = 2, durationSec = 1500 }: Playback) {
      position = sec;
      h.render({ src: sourceFor(episode), snap: { status, positionSec: sec, durationSec } });
    },
    pagehide: () => listeners.get("pagehide")?.(),
    unmount: () => h.unmount(),
    settle: flushPromises,
  };
}

/** Runs `useTraktScrobble` on a scripted playback clock; `scrobbles` is what the provider's `scrobble` received. */
export function traktScrobbleHarness() {
  let position = 0;
  const scrobbles: Scrobble[] = [];
  const beacons: Beacon[] = [];
  const listeners = new Map<string, () => void>();
  const sourceFor = episodeSource();
  const trakt = {
    isConnected: true,
    resolveTarget: () => ({ kind: "movie", ids: { imdb: "tt9" } }),
    scrobble: (action: string, args: { progress: number }) => {
      scrobbles.push({ action, pct: args.progress });
      return Promise.resolve();
    },
  };
  const h = hookHarness(
    "src/lib/trakt/scrobble-hook.ts",
    "useTraktScrobble",
    {
      "./provider": { useTrakt: () => trakt },
      "./config": { TRAKT_API_BASE: "https://api.trakt.test", TRAKT_API_VERSION: "2" },
      "./credentials": { traktApiKey: () => "key" },
      "./session": { getSession: () => ({ accessToken: "token" }) },
      "@/lib/player/playback-clock": { getPlaybackPosition: () => position },
    },
    {
      window: playerWindow(listeners),
      fetch: (url: string, init: { keepalive?: boolean; body: string }) =>
        recordBeacon(beacons)(url, {
          keepalive: init.keepalive,
          body: JSON.stringify({ pct: JSON.parse(init.body).progress }),
        }),
    },
  );
  return {
    scrobbles,
    beacons,
    at({ status, sec, episode = 2, durationSec = 1500 }: Playback) {
      position = sec;
      h.render({ src: sourceFor(episode), snap: { status, positionSec: sec, durationSec } });
    },
    pagehide: () => listeners.get("pagehide")?.(),
    unmount: () => h.unmount(),
  };
}
