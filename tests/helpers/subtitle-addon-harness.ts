import * as autoload from "../../src/lib/subtitles/autoload.ts";
import * as candidateRanking from "../../src/lib/subtitles/candidate-ranking.ts";
import * as language from "../../src/lib/subtitles/language.ts";
import * as providerClassification from "../../src/lib/subtitles/provider-classification.ts";
import * as providerLabel from "../../src/lib/subtitles/provider-label.ts";
import * as providerUrl from "../../src/lib/subtitles/provider-url.ts";
import * as searchCache from "../../src/lib/subtitles/search-cache.ts";
import * as streamHints from "../../src/lib/subtitles/stream-hints.ts";
import * as menuUtils from "../../src/components/player/subtitle-menu/utils.ts";
import { addonAccepts } from "../../src/lib/addons.ts";
import { hookHarness, loadModule } from "./hook-harness.ts";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const icons = new Proxy({}, { get: (_target, name) => String(name) });
const t = (key: string) => key;
const noop = () => {};
export const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

export type FakeFetch = (url: string) => Promise<{ ok: boolean; status?: number; json(): any }>;

/** A fetch answer that resolves with `{ subtitles }`. */
export const subtitles = (list: unknown[]) =>
  Promise.resolve({ ok: true, json: async () => ({ subtitles: list }) });

/** Loads providers/addons.ts with the real manifest matching and a scripted safeFetch. */
export function loadAddonProvider(fetch: FakeFetch) {
  return loadModule("src/lib/subtitles/providers/addons.ts", {
    "@/lib/addons": { addonAccepts },
    "@/lib/safe-fetch": { safeFetch: fetch },
    "@/lib/debug": { dlog: noop },
    "../language": language,
    "../autoload": autoload,
    "../provider-classification": providerClassification,
    "../provider-url": providerUrl,
    "../provider-label": providerLabel,
  });
}

/** Loads search.ts over the real addon provider; the other providers stay off. */
export function loadSubtitleSearch(fetch: FakeFetch) {
  return loadModule("src/lib/subtitles/search.ts", {
    "@/lib/debug": { dinfo: noop, dwarn: noop },
    "./providers/wyzie": { searchWyzie: async () => [] },
    "./providers/addons": loadAddonProvider(fetch),
    "./providers/opensubtitles-v3": { searchOpenSubtitlesV3: async () => [] },
    "./autosync/sub-sources": { pickSources: () => [], searchExtraSubSources: noop, toSubResult: noop },
    "./language": language,
    "./candidate-ranking": candidateRanking,
    "./stream-hints": streamHints,
    "./autoload": autoload,
    "./provider-auth": { bindSubtitleDownloadAuth: noop, browserSubtitleCredentialKey: noop },
    "./provider-url": providerUrl,
  });
}

/** Loads addon-source.ts with a fixed local install list and no cloud account. */
export function loadAddonSource(installed: unknown[], fetchManifestAt: (url: string) => Promise<unknown>) {
  return loadModule("src/lib/subtitles/addon-source.ts", {
    "@/lib/addons": { userAddons: async () => [] },
    "@/lib/addon-store": { fetchManifestAt, loadInstalled: () => installed },
    "@/lib/debug": { dlog: noop },
    "./autoload": autoload,
  });
}

/** Renders the subtitle modal's search section; `searches` records every query sent to providers. */
export function searchSectionHarness(context: Record<string, unknown>) {
  const searches: Record<string, unknown>[] = [];
  const settings = {
    settings: {
      subProvidersEnabled: {},
      subdlApiKey: "",
      subsourceApiKey: "",
      preferredSubLangs: ["en"],
    },
  };
  const h = hookHarness(
    "src/components/player/subtitle-menu/search-section.tsx",
    "SearchSection",
    {
      "lucide-react": icons,
      "@/lib/auth": { useAuth: () => ({ authKey: null }) },
      "@/lib/subtitles/addon-source": { gatherSubtitleAddons: async () => [] },
      "@/lib/subtitles/language": language,
      "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
      "@/lib/subtitles/search": {
        searchSubtitles: async (query: Record<string, unknown>) => (searches.push(query), []),
      },
      "@/lib/subtitles/provider-label": providerLabel,
      "@/lib/subtitles/title-search": {
        bestCandidate: () => null,
        parseTitleQuery: (title: string) => ({ title }),
        searchTitleCandidates: async () => [],
      },
      "@/lib/settings": { useSettings: () => settings },
      "@/lib/i18n": { useT: () => t },
      "./subtitle-context-store": { useSubtitleContext: () => context },
      "./utils": { isVeryNewRelease: () => false },
      "./search-results": { FilterChip: "FilterChip", LangGroup: "LangGroup" },
      "@/lib/subtitles/search-cache": searchCache,
      "./title-suggest": { TargetBar: "TargetBar", TitleSuggestDropdown: "TitleSuggestDropdown" },
      "react/jsx-runtime": jsx,
    },
    { window: { setTimeout: () => 0, clearTimeout: noop } },
  );
  const props = { metaImdbId: "tt1", metaTitle: "Show", season: 1, episode: 5, tracks: [] };
  return { searches, render: () => h.render(props) };
}

/** Renders the player SubtitleMenu; `opened` records each overlay window the button asks for. */
export function subtitleMenuHarness(preferredSubLangs: string[], preferredLanguages: string[]) {
  const opened: { name: string; state: Record<string, any> }[] = [];
  const h = hookHarness("src/components/player/subtitle-menu.tsx", "SubtitleMenu", {
    "lucide-react": { Subtitles: "SubsIcon" },
    "@tauri-apps/api/event": { listen: async () => noop },
    "@/lib/modal-overlay": {
      modalOverlayClose: async () => {},
      modalOverlayEmitResult: noop,
      modalOverlayEmitState: async () => {},
      modalOverlayOpen: (name: string, state: Record<string, any>) => {
        opened.push({ name, state });
        return new Promise(noop);
      },
    },
    "@/lib/player/sub-presets": { openStyleBar: noop },
    "@/lib/player/secondary-sub": { setSecondarySub: noop },
    "@/lib/i18n": { useT: () => t },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) =>
        select({ preferredLanguages, preferredSubLangs, showSubtitleIndicator: true }),
    },
    "@/lib/subtitles/limit-signal": { wasLimitReached: () => false },
    "@/lib/subtitles/pending-subs": { wasPendingSub: () => false },
    "@/lib/subtitles/provider-auth": { bindSubtitleDownloadAuth: async () => undefined },
    "./subtitle-menu/menu-body": { MenuBody: "MenuBody" },
    "./subtitle-menu/resizable-panel": { ResizableSubtitlePanel: "Panel" },
    "./subtitle-menu/subtitle-context-store": { useSubtitleContext: () => null },
    "./subtitle-menu/utils": menuUtils,
    "./transport/tooltip": { Tooltip: "Tooltip" },
    "./transport/hotkey-label": { withHotkey: (s: string) => s },
    "@/lib/player/overlay-dismiss": { watchOutsideMouseDown: () => noop },
    "react/jsx-runtime": jsx,
  });
  return { opened, render: (props: Record<string, unknown>) => h.render({ tracks: [], ...props }) };
}

/** Renders the separate-window SubtitleModal for one overlay state. */
export function renderSubtitleModal(state: Record<string, unknown>) {
  const h = hookHarness("src/components/popups/subtitle-modal.tsx", "SubtitleModal", {
    "@/components/player/subtitle-menu": { SubtitleMenuBody: "SubtitleMenuBody" },
    "@/components/player/subtitle-menu/subtitle-context-store": { publishSubtitleContext: noop },
    "@/components/player/subtitle-menu/resizable-panel": { ResizableSubtitlePanel: "Panel" },
    "@/lib/subtitles/translation-jobs": {
      clearTranslationJobs: noop,
      registerTranslationJob: noop,
    },
    "@/lib/subtitles/added-subs": { replaceAddedSubs: noop },
    "react/jsx-runtime": jsx,
  });
  return h.render({ state, onClose: noop });
}
