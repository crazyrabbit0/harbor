import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { HomeRow } from "@/lib/home/home-types";
import { SERVICES, providerIdsFor } from "@/lib/providers/streaming";
import {
  CATEGORIES,
  dedupe,
  fetchCategoryBatch,
  type Category,
} from "@/lib/providers/service-catalog";
import { CATALOG_REQUEST_TIMEOUT_MS, upsertOrdered, withTimeout } from "@/lib/progressive-rows";
import { useSettings, type StreamingService } from "@/lib/settings";

const ROW_PAGES = 1;
const ROW_CONCURRENCY = 4;
const NO_ROWS: HomeRow[] = [];

async function pooled<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await run(items[i]).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export type BpServiceRows = { rows: HomeRow[]; loading: boolean; hasKey: boolean };

export function bpServiceRowKey(service: StreamingService, categoryId: string): string {
  return `svc:${service}:${categoryId}`;
}

function mix(movies: Meta[], series: Meta[]): Meta[] {
  const out: Meta[] = [];
  const reach = Math.max(movies.length, series.length);
  for (let i = 0; i < reach; i++) {
    const movie = movies[i];
    const show = series[i];
    if (movie) out.push(movie);
    if (show) out.push(show);
  }
  return dedupe(out);
}

function serviceRow(
  service: StreamingService,
  cat: Category,
  metas: Meta[],
  fetcher: (page: number) => Promise<Meta[]>,
): HomeRow {
  return {
    key: bpServiceRowKey(service, cat.id),
    type: cat.fetchMovies ? "movie" : "series",
    name: cat.label,
    metas,
    page: 1,
    hasMore: true,
    fetcher,
  };
}

export function useBpServiceRows(service: StreamingService): BpServiceRows {
  const { settings } = useSettings();
  const tmdbKey = settings.tmdbKey;
  const region = settings.region;
  const reqKey = tmdbKey ? `${service}\0${tmdbKey}\0${region}` : "";
  const [state, setState] = useState<{ key: string; rows: HomeRow[]; done: boolean }>({
    key: "",
    rows: NO_ROWS,
    done: false,
  });

  useEffect(() => {
    if (!reqKey) return;
    let cancelled = false;
    let acc: HomeRow[] = NO_ROWS;
    const ids = providerIdsFor(SERVICES[service]);
    const order = CATEGORIES.map((cat) => bpServiceRowKey(service, cat.id));

    void pooled(CATEGORIES, ROW_CONCURRENCY, async (cat) => {
      if (cancelled) return;
      const page = (n: number) =>
        fetchCategoryBatch(tmdbKey, ids, region, cat, n - 1, ROW_PAGES).then((b) =>
          mix(b.movies, b.series),
        );
      const metas = await withTimeout(page(1), CATALOG_REQUEST_TIMEOUT_MS);
      if (cancelled || metas.length === 0) return;
      acc = upsertOrdered(acc, serviceRow(service, cat, metas, page), order);
      setState({ key: reqKey, rows: acc, done: false });
    }).then(() => {
      if (!cancelled) {
        setState((cur) =>
          cur.key === reqKey ? { ...cur, done: true } : { key: reqKey, rows: NO_ROWS, done: true },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reqKey, service, tmdbKey, region]);

  if (!reqKey) return { rows: NO_ROWS, loading: false, hasKey: false };
  const rows = state.key === reqKey ? state.rows : NO_ROWS;
  const loading = state.key !== reqKey || !state.done;
  return { rows, loading, hasKey: true };
}
