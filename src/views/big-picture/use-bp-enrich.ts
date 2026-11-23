import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { tmdbDetails, type TmdbDetail } from "@/lib/providers/tmdb/tmdb-details";

const cache = new Map<string, TmdbDetail | null>();
const DWELL_MS = 140;

// The untagged detail is one render stale the moment the meta flips, so a
// consumer that gates on it alone arms itself against the previous title.
export type BpEnrich = { id: string; detail: TmdbDetail | null; settled: boolean };

/**
 * What the dwell prefetch already fetched for this title, if anything.
 *
 * The spotlight enriches the focused card after a 140ms dwell and keeps the
 * result here. Opening that same card then called tmdbDetails again from
 * scratch, so Harbor paid for the prefetch and threw it away one keypress
 * later, and the detail page filled in its cast, ratings and tagline half a
 * second after it had already appeared. Reading the map costs nothing and the
 * miss path is unchanged.
 */
export function peekBpEnrich(id: string | undefined): TmdbDetail | null {
  return id ? (cache.get(id) ?? null) : null;
}

export async function warmBpEnrich(tmdbKey: string, meta: Meta | null): Promise<TmdbDetail | null> {
  const id = meta?.id;
  if (!tmdbKey || !meta || !id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  try {
    const detail = await tmdbDetails(tmdbKey, meta);
    cache.set(id, detail);
    return detail;
  } catch {
    cache.set(id, null);
    return null;
  }
}

export function useBpEnrichFor(meta: Meta | null, enabled = true): BpEnrich {
  const { settings } = useSettings();
  const id = meta?.id ?? "";
  const reqKey = enabled && meta && settings.tmdbKey ? `${id}\0${settings.tmdbKey}` : "";
  const [state, setState] = useState<{ key: string; value: BpEnrich }>({
    key: "",
    value: { id: "", detail: null, settled: false },
  });

  useEffect(() => {
    if (!enabled || !meta || !settings.tmdbKey || cache.has(id)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      tmdbDetails(settings.tmdbKey, meta)
        .then((d) => {
          cache.set(id, d);
          if (alive) setState({ key: reqKey, value: { id, detail: d, settled: true } });
        })
        .catch(() => {
          cache.set(id, null);
          if (alive) setState({ key: reqKey, value: { id, detail: null, settled: true } });
        });
    }, DWELL_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [reqKey, id, enabled, meta, settings.tmdbKey]);

  if (!reqKey) return { id, detail: null, settled: true };
  if (cache.has(id)) return { id, detail: cache.get(id) ?? null, settled: true };
  return state.key === reqKey ? state.value : { id, detail: null, settled: false };
}

export function useBpEnrich(meta: Meta | null, enabled = true): TmdbDetail | null {
  return useBpEnrichFor(meta, enabled).detail;
}
