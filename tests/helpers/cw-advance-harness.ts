import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const episodeKey = (id: string, s: number, e: number) => `${id}:${s}:${e}`;

export const simklProgress = (episodes = [1], id = "tt100", completedSeries: any[] = []) => {
  const now = Date.now();
  return {
    statuses: new Map([[id, "watching"]]),
    watched: new Map([[id, new Set(episodes.map((e) => `1:${e}`))]]),
    watchedAt: new Map([[id, new Map(episodes.map((e) => [`1:${e}`, now]))]]),
    completedSeries,
  };
};

function compile(
  path: string,
  require: (name: string) => any,
  source = readFileSync(path, "utf8"),
) {
  const module = { exports: {} as any };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", "window", "document", code)(
    require,
    module,
    module.exports,
    {
      setInterval: () => 1,
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} },
  );
  return module.exports;
}

/** Runs the real use-cw-advance hook with scripted Simkl history and episode lists. */
export function cwAdvanceHarness() {
  const resumes = new Map<string, any>(),
    manual = new Map<string, boolean>();
  const lastPlayed = new Map<string, any>();
  const dismissed = new Set<string>();
  const settings = { cwSources: { simkl: true }, cwHideCaughtUp: false, cwPerProfile: false };
  const profile = { id: "a" },
    session: object | null = { username: "fixture" };
  let remote: any = simklProgress();
  let episodes: any[] = [1, 2, 3, 4].map((episode) => ({
    season: 1,
    episode,
    airDate: "2020-01-01",
  }));
  const states: any[] = [],
    refs: any[] = [],
    effects: any[] = [];
  let stateSlot = 0,
    refSlot = 0,
    effectSlot = 0,
    dirty = false;
  const pending: (() => void)[] = [];
  const modules = new Map<string, any>();
  let params: any[] = [[], "", true, []];
  const mocks: Record<string, any> = {
    react: {
      useState: (initial: any) => {
        const slot = stateSlot++;
        if (!(slot in states)) states[slot] = initial;
        return [
          states[slot],
          (update: any) => {
            const next = typeof update === "function" ? update(states[slot]) : update;
            if (!Object.is(next, states[slot])) {
              states[slot] = next;
              dirty = true;
            }
          },
        ];
      },
      useRef: (current: any) => refs[refSlot++] ?? (refs[refSlot - 1] = { current }),
      useSyncExternalStore: (_subscribe: any, get: any) => get(),
      useEffect: (fn: any, deps: any[]) => {
        const slot = effectSlot++,
          old = effects[slot];
        if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return;
        pending.push(() => {
          old?.cleanup?.();
          effects[slot] = { deps, cleanup: fn() };
        });
      },
    },
    "@/lib/resume": {
      readResumeEntry: (id: string, s: number, e: number) => resumes.get(episodeKey(id, s, e)),
      lastPlayedEpisode: (id: string) => lastPlayed.get(id),
      readResumeSource: () => undefined,
    },
    "@/lib/manual-watched": {
      manualWatchedState: (id: string, s: number, e: number) => manual.get(episodeKey(id, s, e)),
    },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) => select(settings),
    },
    "@/lib/profiles": {
      useProfiles: () => ({ activeProfile: profile, profiles: [] }),
      anyProfileSharesStremioWith: () => true,
    },
    "@/lib/simkl/session": { getSession: () => session, subscribeSession: () => () => {} },
    "@/lib/simkl/list-status": {
      loadSimklProgress: async () => remote,
      simklWatchedForId: (map: Map<string, Set<string>>, id: string) => map.get(id) ?? new Set(),
      statusForId: (map: Map<string, string>, id: string) => map.get(id),
    },
    "@/lib/cw-dismiss": {
      useCwDismissVersion: () => 0,
      isCwDismissed: (i: any) =>
        dismissed.has(episodeKey(i._id, i.state?.season, i.state?.episode)),
    },
    "@/lib/cw-profile": { privateCwProfileId: () => (settings.cwPerProfile ? profile.id : null) },
    "@/lib/providers/anime-mapping": { relatedLibraryIds: async () => [] },
    "@/lib/anime-detect": { isDetectedAnime: () => false },
    "@/lib/safe-fetch": {
      safeFetch: () => {
        throw new Error("unexpected live request");
      },
    },
    "@/lib/hidden-episodes": { isEpisodeHidden: () => false },
    "@/lib/season-view-pref": { getViewedSeason: () => undefined },
    "@/lib/anime-cw-ids": { getAnimeCwId: () => null },
    "@/lib/providers/anime-franchise-root": { isSplitFranchiseKitsu: () => false },
    "@/lib/providers/kitsu": { parseKitsuId: () => null },
    "@/lib/providers/jikan": { franchiseDedupKey: (name: string) => name.toLowerCase() },
    "@/lib/local-cw": { listLocalCw: () => [] },
    "@/lib/continue-watching": { localToLibraryItem: (i: any) => i },
    "@/lib/cw-anime-episode": {},
  };
  const seriesSource = readFileSync("src/lib/series-episodes.ts", "utf8");
  const parsed = ts.createSourceFile("series.ts", seriesSource, ts.ScriptTarget.Latest, true);
  const nextFn = parsed.statements.find(
    (node: any) => ts.isFunctionDeclaration(node) && node.name?.text === "nextUnwatchedAfter",
  )!;
  mocks["@/lib/series-episodes"] = {
    ...compile(
      "",
      () => {
        throw new Error("unexpected dependency");
      },
      nextFn.getText(parsed),
    ),
    fetchEpisodeList: async () => episodes,
    fetchAdjacentEpisodes: async (_meta: any, cur: any) => {
      const idx = episodes.findIndex((e) => e.season === cur.season && e.episode === cur.episode);
      return { next: idx < 0 ? null : (episodes[idx + 1] ?? null) };
    },
  };
  const load = (name: string): any => {
    if (name in mocks) return mocks[name];
    if (name === "./anime-detect") return mocks["@/lib/anime-detect"];
    assert.ok(name.startsWith("@/"), `unexpected import ${name}`);
    if (!modules.has(name)) modules.set(name, compile(`src/${name.slice(2)}.ts`, load));
    return modules.get(name);
  };
  const { useCwAdvance } = load("@/views/home/hooks/use-cw-advance");
  const render = () => {
    stateSlot = refSlot = effectSlot = 0;
    dirty = false;
    const out = useCwAdvance(...params);
    pending.splice(0).forEach((fn) => fn());
    return out;
  };
  return {
    setRemote: (value: any) => {
      remote = value;
    },
    setEpisodes: (value: any[]) => {
      episodes = value;
    },
    render: (...args: any[]) => {
      if (args.length) params = args;
      return render();
    },
    async flush() {
      let out: any[] = [];
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setImmediate(resolve));
        if (dirty || i === 0) out = render();
      }
      return out;
    },
  };
}
