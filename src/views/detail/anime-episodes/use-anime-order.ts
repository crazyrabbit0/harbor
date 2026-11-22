import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { tmdbLanguageIso } from "@/lib/providers/tmdb/tmdb-client";
import { useEpisodeOrder } from "../series-episodes/use-episode-order";
import type { PickerItem } from "../series-episodes/season-arc-picker";
import { buildSoloAnimeOrder, buildAnimeOrder } from "./anime-order-utils";
import { foreignAnimeProviderSeasons } from "@/lib/streams/anime-identity";
import { parseKitsuId } from "@/lib/providers/kitsu";
import { splitFranchiseDisplaySeason } from "@/lib/streams/anime-identity-core";
import { readAtVersion } from "@/lib/read-at-version";

export type AnimeOrder = {
  items: PickerItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  visibleEpisodes: KitsuEpisode[];
  /** Every numbered season's rows in display order, excluding specials. */
  orderedEpisodes: KitsuEpisode[];
};

export function useAnimeOrder(
  imdbId: string | null,
  metaId: string,
  episodes: KitsuEpisode[],
  provider: "default" | "tmdb" | "tvdb",
  seasonType: string,
  tvdbKey: string,
  preferredSeasonKey?: string,
  intentSeasonKey?: string,
  solo = false,
): AnimeOrder | null {
  const t = useT();
  const ordering = useEpisodeOrder(imdbId, metaId, provider, seasonType, tvdbKey, !solo);
  const partSeason = solo ? splitFranchiseDisplaySeason(parseKitsuId(metaId)) : null;
  const built = useMemo(
    // pickLocalizedText keys its script tests by ISO-1 ("ko"), not TVDB codes ("kor").
    () =>
      readAtVersion(metaId, () =>
        solo
          ? buildSoloAnimeOrder(episodes, t("Specials"), (s) =>
              t("Season {n}", { n: partSeason ?? s }),
            )
          : buildAnimeOrder(ordering, episodes, t("Specials"), tmdbLanguageIso()),
      ),
    [solo, ordering, episodes, t, partSeason, metaId],
  );
  const [selState, setSelState] = useState<{ metaId: string; key: string } | null>(null);
  const foreignKey = solo ? "" : `${metaId}:${imdbId ?? ""}`;
  const [foreignState, setForeignState] = useState<{
    key: string;
    seasons: Set<number> | null;
  } | null>(null);
  useEffect(() => {
    if (!foreignKey) return;
    let cancelled = false;
    void foreignAnimeProviderSeasons(metaId, imdbId)
      .then((s) => {
        if (!cancelled) setForeignState({ key: foreignKey, seasons: s });
      })
      .catch(() => {
        if (!cancelled) setForeignState({ key: foreignKey, seasons: null });
      });
    return () => {
      cancelled = true;
    };
  }, [foreignKey, metaId, imdbId]);
  const foreignSeasons =
    foreignKey && foreignState?.key === foreignKey ? foreignState.seasons : null;
  const filteredBuilt = useMemo(() => {
    if (!built || !foreignSeasons || foreignSeasons.size === 0) return built;
    const items = built.items.filter(
      (i) => !(Number.isFinite(Number(i.key)) && foreignSeasons.has(Number(i.key))),
    );
    if (items.length === built.items.length || items.length === 0) return built;
    const subsetByKey = new Map(built.subsetByKey);
    for (const s of foreignSeasons) subsetByKey.delete(String(s));
    return { ...built, items, subsetByKey };
  }, [built, foreignSeasons]);
  const onSelect = useCallback((key: string) => setSelState({ metaId, key }), [metaId]);
  if (!filteredBuilt) return null;
  const touched = selState?.metaId === metaId;
  const sel = touched ? selState.key : null;
  const activeKey =
    touched && filteredBuilt.items.some((i) => i.key === sel)
      ? (sel as string)
      : intentSeasonKey && filteredBuilt.items.some((i) => i.key === intentSeasonKey)
        ? intentSeasonKey
        : preferredSeasonKey && filteredBuilt.items.some((i) => i.key === preferredSeasonKey)
          ? preferredSeasonKey
          : filteredBuilt.items[0].key;
  return {
    items: filteredBuilt.items,
    activeKey,
    onSelect,
    visibleEpisodes: filteredBuilt.subsetByKey.get(activeKey) ?? [],
    orderedEpisodes: filteredBuilt.items
      .filter((i) => !i.extra)
      .flatMap((i) => filteredBuilt.subsetByKey.get(i.key) ?? []),
  };
}
