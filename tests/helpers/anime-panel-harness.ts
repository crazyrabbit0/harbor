import { flushPromises, hookHarness } from "./hook-harness.ts";
import { resolveAnimeSlotMatch } from "../../src/views/detail/anime-episodes/anime-slot-match.ts";

export type TvdbSlot = { id: number; seasonNumber: number; episodeNumber: number; abs?: number };

/** A TVDB ordering holding exactly these slots, grouped into seasons by `seasonNumber`. */
export function tvdbOrderOf(slots: TvdbSlot[]) {
  const seasonNumbers = [...new Set(slots.map((s) => s.seasonNumber))].sort((a, b) => a - b);
  const bySeason = new Map<number, any[]>();
  const absByEpId = new Map<number, number>();
  for (const s of slots) {
    const bucket = bySeason.get(s.seasonNumber) ?? [];
    bucket.push({
      id: s.id,
      seasonNumber: s.seasonNumber,
      episodeNumber: s.episodeNumber,
      name: `T${s.id}`,
      overview: "",
    });
    bySeason.set(s.seasonNumber, bucket);
    if (s.abs != null) absByEpId.set(s.id, s.abs);
  }
  return {
    seasons: seasonNumbers.map((n) => ({ seasonNumber: n, name: `Season ${n}` })),
    bySeason,
    absByEpId,
    imageByAbs: new Map<number, string>(),
  } as any;
}

export type PanelResult = {
  items: { key: string; extra?: boolean; count: number }[];
  visibleEpisodes: any[];
  orderedEpisodes: any[];
};

/** Runs the real `useAnimeTvdbPanel` over `pool` and the given TVDB slots until its panel is built. */
export async function animePanelOf(pool: any[], slots: TvdbSlot[]): Promise<PanelResult | null> {
  const ordering = tvdbOrderOf(slots);
  const h = hookHarness(
    "src/views/detail/anime-episodes/use-anime-tvdb-panel.ts",
    "useAnimeTvdbPanel",
    {
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/providers/anime-mapping": { kitsuToTvdb: async () => 1 },
      "@/lib/providers/anime-detail": { isFranchiseExtra: () => false },
      "@/lib/providers/tvdb": {
        tvdbLangFromIso1: () => "eng",
        tvdbOrderTypeHasEpisodes: async () => true,
        tvdbSeasonTypes: async () => [{ value: "aired", label: "Aired Order" }],
        tvdbSeriesByRemote: async () => null,
      },
      "@/lib/providers/tmdb/tmdb-client": { tmdbLanguageIso: () => "en" },
      "@/lib/localized-text": {
        pickLocalizedText: (c: { text?: string }[]) => c.find((x) => x.text)?.text,
      },
      "@/lib/providers/harbor-imdb": { harborImdbEpisodesCached: () => undefined },
      "@/lib/providers/tvdb-order": {
        fetchTvdbOrderBySeriesId: async () => ordering,
        seasonDateRange: () => ({}),
      },
      "@/lib/streams/anime-identity": { foreignAnimeProviderSeasons: async () => null },
      "./anime-slot-match": { resolveAnimeSlotMatch },
    },
  );
  // The harness passes one render argument; the hook takes positionals.
  const hook = h.exports.useAnimeTvdbPanel;
  h.exports.useAnimeTvdbPanel = (a: unknown[]) => hook(...a);
  const args = [1, null, pool, "aired", "key", true];
  let result = h.render(args);
  for (let i = 0; i < 8 && !result.panel; i++) {
    await flushPromises();
    result = h.render(args);
  }
  h.unmount();
  return result.panel;
}
