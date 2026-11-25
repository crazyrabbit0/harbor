import { invoke } from "@tauri-apps/api/core";
import type {
  BridgeCatalogueRow,
  BridgeEpisode as GeneratedEpisode,
  BridgeLink,
  BridgeMedia as GeneratedMedia,
  BridgeProvider,
  BridgeSearchItem,
  BridgeSubtitle,
  CapstanCatalogue,
  CapstanCataloguePage,
  CapstanLinks,
  CapstanLoad,
  CapstanProviders,
  CapstanSearch,
} from "@/lib/generated/capstan-ipc";

export type { BridgeCatalogueRow, BridgeLink, BridgeProvider, BridgeSearchItem, BridgeSubtitle };

type EpisodeOptional = "posterUrl" | "description" | "runtimeMinutes" | "airDate";

// Media built in the app (fixtures, older bridges) may leave the provider's optional extras out.
export type BridgeEpisode = Omit<GeneratedEpisode, EpisodeOptional> &
  Partial<Pick<GeneratedEpisode, EpisodeOptional>>;

type MediaOptional =
  | "posterUrl"
  | "backgroundPosterUrl"
  | "plot"
  | "tags"
  | "durationMinutes"
  | "contentRating"
  | "score"
  | "comingSoon"
  | "recommendations"
  | "actors"
  | "trailerUrls"
  | "syncIds";

export type BridgeMedia = Omit<GeneratedMedia, MediaOptional | "episodes"> &
  Partial<Pick<GeneratedMedia, MediaOptional>> & { episodes: BridgeEpisode[] };

/** Why an empty answer was empty, when the addresses the provider uses refused during the call.
 * Absent means the service answered and the emptiness is not the network's doing. */
export type BridgeNote = string | null;

export type BridgeResults<T> = { items: T[]; note: BridgeNote };

export type BridgeLinkSet = {
  success: boolean;
  links: BridgeLink[];
  subtitles: BridgeSubtitle[];
  note: BridgeNote;
};

const PROVIDER_TTL_MS = 15_000;

let providerCache: { at: number; list: BridgeProvider[] } | null = null;
let providerInflight: Promise<BridgeProvider[]> | null = null;

export function extensionsSupported(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let warming: Promise<unknown> | null = null;

/** Brings the bridge up and restores its extensions, before anything starts counting.
 *
 * The first call into the bridge spawns its runtime and loads every installed extension, which is
 * measured in seconds, and every call after it is a millisecond. That is setup rather than a
 * plugin's work, so it is paid here instead of out of a plugin's deadline: charged to the plugin,
 * it left a slow one too little of its budget and made the first run report nothing while the
 * second answered. A failed warm is forgotten so the next caller tries again. */
export function warmBridge(): Promise<unknown> {
  warming ??= invoke("capstan_ping").catch(() => {
    warming = null;
    return null;
  });
  return warming;
}

function note(raw: BridgeNote): BridgeNote {
  return raw?.trim() || null;
}

export async function bridgeProviders(): Promise<BridgeProvider[]> {
  const hit = providerCache;
  if (hit && Date.now() - hit.at < PROVIDER_TTL_MS) return hit.list;
  if (providerInflight) return providerInflight;
  providerInflight = (async () => {
    const { providers } = await invoke<CapstanProviders>("capstan_providers");
    providerCache = { at: Date.now(), list: providers };
    return providers;
  })().finally(() => {
    providerInflight = null;
  });
  return providerInflight;
}

export function forgetBridgeProviders(): void {
  providerCache = null;
}

export async function bridgeSearch(
  providerId: string,
  query: string,
  quick: boolean,
  page = 1,
): Promise<BridgeResults<BridgeSearchItem>> {
  const raw = await invoke<CapstanSearch>("capstan_search", { providerId, query, quick, page });
  return { items: raw.results, note: note(raw.note) };
}

export async function bridgeLoad(
  providerId: string,
  url: string,
): Promise<{ media: BridgeMedia | null; note: BridgeNote }> {
  const raw = await invoke<CapstanLoad>("capstan_load", { providerId, url });
  return { media: raw.found ? raw.result : null, note: note(raw.note) };
}

export async function bridgeLoadLinks(providerId: string, data: string): Promise<BridgeLinkSet> {
  const raw = await invoke<CapstanLinks>("capstan_load_links", { providerId, data });
  return {
    success: raw.success,
    links: raw.links,
    subtitles: raw.subtitles,
    note: note(raw.note),
  };
}

export async function bridgeCatalogue(providerId: string): Promise<BridgeCatalogueRow[]> {
  const { rows } = await invoke<CapstanCatalogue>("capstan_catalogue", { providerId });
  return rows.map((row) => ({ ...row, name: row.name.trim() })).filter((row) => row.name);
}

/** A provider may answer one page with several named sections, so a page is flattened back into
 * the items of the row that was asked for. */
export async function bridgeCataloguePage(
  providerId: string,
  row: string,
  page: number,
): Promise<BridgeResults<BridgeSearchItem> & { hasNext: boolean }> {
  const raw = await invoke<CapstanCataloguePage>("capstan_catalogue_page", {
    providerId,
    row,
    page,
  });
  return {
    items: raw.sections.flatMap((section) => section.items),
    note: note(raw.note),
    hasNext: raw.hasNext,
  };
}
