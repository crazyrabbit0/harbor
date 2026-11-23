import { useEffect, useMemo, useRef, useState } from "react";
import { createAddonCatalogFetcher, type AddonCatalogCursor, type CatalogDef } from "@/lib/addons";
import { fetchManifestAt, loadInstalled } from "@/lib/addon-store";
import type { Meta } from "@/lib/cinemeta";
import { bpAddonBase, bpCursorFor, bpUsableCatalogs } from "./bp-addon-entries";

export type BpAddonCatalog = {
  key: string;
  name: string;
  type: string;
  cursor: AddonCatalogCursor;
};

function toCatalogs(base: string, defs: CatalogDef[]): BpAddonCatalog[] {
  const out: BpAddonCatalog[] = [];
  for (const def of defs) {
    const cursor = bpCursorFor(base, [def]);
    if (!cursor) continue;
    out.push({ key: `${def.type}:${def.id}`, name: def.name, type: def.type, cursor });
  }
  return out;
}

function localCatalogs(base: string): BpAddonCatalog[] {
  try {
    const hit = loadInstalled().find((a) => bpAddonBase(a.transportUrl) === base);
    return hit ? toCatalogs(base, bpUsableCatalogs(hit.manifest)) : [];
  } catch {
    return [];
  }
}

/**
 * The install list is a synchronous localStorage read, so a normal open paints
 * its chips in frame 0. The fetch is only for the case slimManifest already
 * documents: a quota strip leaves the entry with no manifest at all, and
 * without it this page would be permanently empty rather than one GET slow.
 */
export function useBpAddonCatalogs(base: string): {
  catalogs: BpAddonCatalog[];
  loading: boolean;
} {
  const seed = useMemo(() => localCatalogs(base), [base]);
  const [fetched, setFetched] = useState<{ base: string; catalogs: BpAddonCatalog[] } | null>(null);

  useEffect(() => {
    if (seed.length > 0) return;
    let alive = true;
    void fetchManifestAt(`${base}/manifest.json`)
      .then((manifest) => {
        if (alive) setFetched({ base, catalogs: toCatalogs(base, bpUsableCatalogs(manifest)) });
      })
      .catch(() => {
        if (alive) setFetched({ base, catalogs: [] });
      });
    return () => {
      alive = false;
    };
  }, [base, seed]);

  if (seed.length > 0) return { catalogs: seed, loading: false };
  const ready = fetched?.base === base;
  return { catalogs: ready ? fetched.catalogs : [], loading: !ready };
}

const EMPTY_METAS: Meta[] = [];

export function useBpAddonFeed(cursor: AddonCatalogCursor | undefined): {
  metas: Meta[];
  loading: boolean;
  done: boolean;
  loadMore: () => void;
} {
  const key = cursor ? `${cursor.base}|${cursor.type}|${cursor.id}` : "";
  const [state, setState] = useState<{
    key: string;
    metas: Meta[];
    loading: boolean;
    done: boolean;
  }>({ key: "", metas: EMPTY_METAS, loading: false, done: false });
  // The fetcher learns the addon's page size from its first answer, so it has to
  // survive across loadMore calls or every page re-requests skip=0.
  const fetcher = useRef<((page: number, loaded?: number) => Promise<Meta[]>) | null>(null);
  const busy = useRef(false);
  const loaded = useRef(0);

  useEffect(() => {
    loaded.current = 0;
    busy.current = false;
    fetcher.current = cursor ? createAddonCatalogFetcher(cursor) : null;
    if (!cursor || !key) return;
    let alive = true;
    void fetcher.current!(1, 0)
      .then((page) => {
        if (!alive) return;
        loaded.current = page.length;
        setState({ key, metas: page, loading: false, done: page.length === 0 });
      })
      .catch(() => {
        if (alive) setState({ key, metas: EMPTY_METAS, loading: false, done: true });
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const metas = key && state.key === key ? state.metas : EMPTY_METAS;
  const loading = Boolean(key) && (state.key !== key || state.loading);
  const done = Boolean(key) && state.key === key && state.done;

  const loadMore = (): void => {
    const next = fetcher.current;
    if (!next || busy.current || done || loading) return;
    busy.current = true;
    const activeKey = key;
    void next(2, loaded.current)
      .then((page) => {
        if (page.length === 0) {
          setState((prev) => (prev.key === activeKey ? { ...prev, done: true } : prev));
          return;
        }
        loaded.current += page.length;
        // Addons repeat entries across pages far more often than TMDB does, and
        // a duplicated id inside a keyed grid is a React warning plus a tile
        // that shares focus state with its twin.
        setState((prev) => {
          if (prev.key !== activeKey) return prev;
          const seen = new Set(prev.metas.map((m) => m.id));
          return {
            ...prev,
            metas: [...prev.metas, ...page.filter((m) => m.id && !seen.has(m.id))],
          };
        });
      })
      .catch(() => setState((prev) => (prev.key === activeKey ? { ...prev, done: true } : prev)))
      .finally(() => {
        busy.current = false;
      });
  };

  return { metas, loading, done, loadMore };
}
