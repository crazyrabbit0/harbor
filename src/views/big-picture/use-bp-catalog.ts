import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { HomeRow } from "@/lib/home/home-types";
import {
  buildCinemetaRows,
  buildTmdbRows,
  isStreamingServiceRow,
  mergeRows,
} from "@/views/home/home-rows";
import { isAnimeRow } from "@/views/anime";
import { loadAddonRows, type AddonRow } from "@/lib/addons";
import { applyHomeRowCustomization } from "@/lib/home-customization";
import { bpHomeCacheLoad, bpHomeCacheSave } from "./bp-home-cache";
import { useBpExtraRows } from "./use-bp-extra-rows";
import { useBpTop10Base } from "./bp-top10-feed";
import { useBpKeyed } from "./use-bp-keyed";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings/types";
import { useHideAnimeRows } from "@/lib/anime-hide";

export type BpCatalog = { rows: HomeRow[]; hero: Meta[]; loading: boolean; failed: boolean };

type Built = { rows: HomeRow[]; hero: Meta[] };

const EMPTY: Built = { rows: [], hero: [] };
const NO_METAS: Meta[] = [];
let cache: { key: string; built: Built } | null = null;

async function buildBase(settings: Settings): Promise<Built> {
  let base: Built = EMPTY;
  if (settings.homeMode !== "classic") {
    base = settings.tmdbKey
      ? await buildTmdbRows(settings).catch(() => EMPTY)
      : await buildCinemetaRows().catch(() => EMPTY);
  }
  if (base.rows.length === 0) base = await buildCinemetaRows().catch(() => EMPTY);
  return base;
}

function usableAddonRows(addons: AddonRow[], classic: boolean): AddonRow[] {
  return classic ? addons : addons.filter((a) => !isAnimeRow(a) && !isStreamingServiceRow(a.name));
}

export function useBpCatalog(): BpCatalog {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const extra = useBpExtraRows();

  const key = [
    settings.tmdbKey ? "tmdb" : "cinemeta",
    settings.homeMode ?? "",
    settings.region ?? "",
    settings.homeShowAllAddonRows ? "all" : "dedup",
    authKey ? "auth" : "anon",
  ].join(":");

  const primed = cache?.key === key ? cache.built : null;
  const [state, setState] = useState<{
    key: string;
    built: Built;
    loading: boolean;
    failed: boolean;
  }>({ key: "", built: EMPTY, loading: true, failed: false });

  useEffect(() => {
    if (cache?.key === key) return;
    let alive = true;
    let live = false;

    void bpHomeCacheLoad(key).then((snap) => {
      if (!alive || live || !snap) return;
      setState({ key, built: snap, loading: false, failed: false });
    });

    const run = async () => {
      const classic = settings.homeMode === "classic";
      const base = await buildBase(settings);
      if (!alive) return;

      const merged = { rows: mergeRows(base.rows, []), hero: base.hero };
      live = true;
      cache = { key, built: merged };
      setState({ key, built: merged, loading: false, failed: merged.rows.length === 0 });
      void bpHomeCacheSave(key, merged);

      const dedup = !classic && !settings.homeShowAllAddonRows;
      const addons = await loadAddonRows(authKey, { dedup }).catch(() => [] as AddonRow[]);
      if (!alive || addons.length === 0) return;
      const usable = usableAddonRows(addons, classic);
      const withAddons = { rows: mergeRows(base.rows, usable, { dedup }), hero: base.hero };
      cache = { key, built: withAddons };
      setState({ key, built: withAddons, loading: false, failed: false });
      void bpHomeCacheSave(key, withAddons);
    };
    void run().catch(() => {
      if (alive) {
        setState((cur) => ({
          key,
          built: cur.key === key ? cur.built : EMPTY,
          loading: false,
          failed: true,
        }));
      }
    });

    return () => {
      alive = false;
    };
  }, [key, authKey]);

  const built = primed ?? (state.key === key ? state.built : EMPTY);
  const loading = primed ? false : state.key === key ? state.loading : true;
  const failed = primed ? false : state.key === key ? state.failed : false;

  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const all: HomeRow[] = [];
    for (const row of [...extra.before, ...built.rows, ...extra.after]) {
      if (seen.has(row.key)) continue;
      seen.add(row.key);
      all.push(row);
    }
    return applyHomeRowCustomization(all, settings.homeRows, false);
  }, [extra.before, extra.after, built.rows, settings.homeRows]);

  const rows = useHideAnimeRows(ordered);
  // Desktop takes its top ten off the first home row (views/home.tsx). Nothing in
  // the TV shell ever did, so isTop10 was permanently false and the top-ten mark
  // could not appear on Home however the user had it set. Keyed on the ids so a
  // late addon merge does not hand the store a new array of the same titles.
  const lead = rows[0]?.metas.slice(0, 10) ?? NO_METAS;
  const leadKey = lead.map((m) => m.id).join("|");
  const top10 = useBpKeyed([leadKey], () => lead);
  useBpTop10Base(top10);

  return { rows, hero: built.hero, loading, failed };
}
