import { useEffect, useRef, useState } from "react";
import {
  fetchCalendarRange,
  fetchCustomCalendar,
  monthRangeISO,
  type CalendarItem,
} from "@/lib/calendar";
import {
  fetchAnticipatedCalendar,
  fetchAniListAiringCalendar,
  fetchAnimeDubCalendar,
  fetchLibraryCalendar,
  fetchSimklCalendar,
  fetchSimklPremieresCalendar,
  fetchTraktCalendar,
} from "@/lib/calendar-sources";
import type { Settings } from "@/lib/settings";
import { t } from "@/lib/i18n";

type Args = {
  source: Settings["calendarSource"];
  authKey: string | null;
  accountId: string | null;
  traktConnected: boolean;
  simklConnected: boolean;
  settings: Settings;
  year: number;
  month: number;
  animeDub: boolean;
};

const SNAPSHOT_KEY = "harbor.calendar.snapshot.v1";
const SNAPSHOT_MAX = 12;
type Snapshot = Record<string, { at: number; items: CalendarItem[] }>;
let snapshotMemo: Snapshot | null = null;

function readSnapshots(): Snapshot {
  if (snapshotMemo) return snapshotMemo;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? "{}");
    snapshotMemo = parsed && typeof parsed === "object" ? (parsed as Snapshot) : {};
  } catch {
    snapshotMemo = {};
  }
  return snapshotMemo;
}

function readSnapshot(key: string | null): CalendarItem[] | null {
  if (!key) return null;
  const hit = readSnapshots()[key];
  return Array.isArray(hit?.items) ? hit.items : null;
}

function writeSnapshot(key: string | null, items: CalendarItem[]): void {
  if (!key) return;
  const all = { ...readSnapshots(), [key]: { at: Date.now(), items } };
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  for (const k of keys.slice(SNAPSHOT_MAX)) delete all[k];
  snapshotMemo = all;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

export function useCalendarData({
  source,
  authKey,
  accountId,
  traktConnected,
  simklConnected,
  settings,
  year,
  month,
  animeDub,
}: Args) {
  // The last result for this view is drawn at once and refreshed in the background; a cold library month takes many requests.
  const custom = settings.customCalendar;
  const keyed =
    source === "all"
      ? settings.region
      : source === "custom"
        ? JSON.stringify([
            settings.region,
            custom.trackedPeople.map((p) => p.id),
            custom.genres.map((g) => `${g.mediaType}${g.id}`),
            custom.watchProviders.map((p) => p.id),
            custom.originCountries,
            custom.mediaTypes,
            custom.includeTraktAnticipated,
            custom.includeTraktWatchlist,
          ])
        : "";
  const snapshotKey =
    source === "games"
      ? null
      : `${source}|${keyed}|${animeDub ? "dub" : ""}|${authKey ? (accountId ?? "signed-in") : ""}|${year}-${month}`;
  const [items, setItems] = useState<CalendarItem[]>(() => readSnapshot(snapshotKey) ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const viewKey = `${source}|${animeDub}|${year}-${month}|${snapshotKey ?? ""}`;
  const prevKeyRef = useRef(viewKey);

  if (prevKeyRef.current !== viewKey) {
    prevKeyRef.current = viewKey;
    setItems(readSnapshot(snapshotKey) ?? []);
    setLoading(true);
    setError(null);
    setProgress(null);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProgress(null);
    const onProgress = (rows: CalendarItem[]) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    };
    const onCount = (done: number, total: number) => {
      if (!cancelled && total > 0) setProgress({ done, total });
    };
    const run = (p: Promise<CalendarItem[]>) => {
      setLoading(true);
      p.then((rows) => {
        if (cancelled) return;
        setItems(rows);
        writeSnapshot(snapshotKey, rows);
      })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : t("Failed to load"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    const stop = () => {
      setItems([]);
      setLoading(false);
    };

    const dispatch = () => {
      if (source === "games") return stop();
      if (source === "library") {
        if (!authKey) return stop();
        return run(
          fetchLibraryCalendar(authKey, year, month, {
            tmdbKey: settings.tmdbKey,
            includeTrakt: traktConnected,
            onProgress,
            onCount,
          }),
        );
      }
      if (source === "trakt") {
        if (!traktConnected) return stop();
        return run(fetchTraktCalendar(year, month, { onProgress }));
      }
      if (source === "simkl") {
        if (!simklConnected) return stop();
        return run(
          fetchSimklCalendar(year, month, { tmdbKey: settings.tmdbKey, onProgress, onCount }),
        );
      }
      if (source === "simkl-anticipated") {
        return run(fetchSimklPremieresCalendar(year, month));
      }
      if (source === "anime") {
        return run(
          animeDub ? fetchAnimeDubCalendar(year, month) : fetchAniListAiringCalendar(year, month),
        );
      }
      if (source === "anticipated") {
        return run(fetchAnticipatedCalendar(year, month, { onProgress }));
      }
      if (source === "custom") {
        if (!settings.tmdbKey) return stop();
        const { start, end } = monthRangeISO(year, month);
        const extras: Promise<CalendarItem[]>[] = [];
        if (settings.customCalendar.includeTraktAnticipated) {
          extras.push(fetchAnticipatedCalendar(year, month).catch(() => []));
        }
        if (settings.customCalendar.includeTraktWatchlist && traktConnected) {
          extras.push(fetchTraktCalendar(year, month).catch(() => []));
        }
        return run(
          fetchCustomCalendar({
            apiKey: settings.tmdbKey,
            region: settings.region,
            filters: {
              trackedPeople: settings.customCalendar.trackedPeople,
              genres: settings.customCalendar.genres,
              watchProviders: settings.customCalendar.watchProviders,
              originCountries: settings.customCalendar.originCountries,
              mediaTypes: settings.customCalendar.mediaTypes,
            },
            start,
            end,
            extra: Promise.all(extras).then((batches) => batches.flat()),
            onProgress,
          }),
        );
      }
      if (!settings.tmdbKey) return stop();
      const { start, end } = monthRangeISO(year, month);
      return run(fetchCalendarRange(settings.tmdbKey, start, end, settings.region, onProgress));
    };

    dispatch();
    return () => {
      cancelled = true;
    };
  }, [
    source,
    authKey,
    traktConnected,
    simklConnected,
    settings.tmdbKey,
    settings.region,
    settings.customCalendar.trackedPeople,
    settings.customCalendar.genres,
    settings.customCalendar.watchProviders,
    settings.customCalendar.originCountries,
    settings.customCalendar.mediaTypes,
    settings.customCalendar.includeTraktAnticipated,
    settings.customCalendar.includeTraktWatchlist,
    year,
    month,
    animeDub,
  ]);

  return { items, loading, error, progress };
}
