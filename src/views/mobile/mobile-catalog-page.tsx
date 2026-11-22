import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettingsSelector } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export const TMDB_PAGE_SIZE = 20;
export const MAX_PAGE = 12;

export type CatalogPage = { metas: Meta[]; more: boolean };
export type CatalogFetch = (page: number) => Promise<CatalogPage>;

export function mergeUnique(prev: Meta[], next: Meta[]): Meta[] {
  const seen = new Set(prev.map((m) => m.id));
  const out = prev.slice();
  for (const m of next) {
    if (m.poster && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

const EMPTY_ITEMS: Meta[] = [];

type GridState = {
  resetKey: string;
  enabled: boolean;
  initialPages: number;
  retry: number;
  items: Meta[];
  nextPage: number;
  status: "loading" | "ready" | "error";
  loadingMore: boolean;
  exhausted: boolean;
};

export function MobileCatalogGrid({
  fetchPage,
  resetKey,
  enabled,
  emptyState,
  onOpenDetail,
  initialPages = 2,
}: {
  fetchPage: CatalogFetch;
  resetKey: string;
  enabled: boolean;
  emptyState: React.ReactNode;
  onOpenDetail: (m: Meta) => void;
  initialPages?: number;
}) {
  const [retry, setRetry] = useState(0);
  const [grid, setGrid] = useState<GridState | null>(null);
  const reqRef = useRef(0);
  const loadingRef = useRef(false);
  const fetchRef = useRef(fetchPage);
  useLayoutEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  const current =
    grid &&
    grid.resetKey === resetKey &&
    grid.enabled === enabled &&
    grid.initialPages === initialPages &&
    grid.retry === retry
      ? grid
      : null;
  const items = current?.items ?? EMPTY_ITEMS;
  const nextPage = current?.nextPage ?? initialPages + 1;
  const status = !enabled ? "ready" : (current?.status ?? "loading");
  const loadingMore = current?.loadingMore ?? false;
  const exhausted = current?.exhausted ?? false;

  useEffect(() => {
    reqRef.current += 1;
    const my = reqRef.current;
    loadingRef.current = false;
    if (!enabled) return;
    const pages = Array.from({ length: initialPages }, (_, i) => i + 1);
    Promise.all(pages.map((p) => fetchRef.current(p)))
      .then((res) => {
        if (reqRef.current !== my) return;
        setGrid({
          resetKey,
          enabled,
          initialPages,
          retry,
          items: mergeUnique(
            [],
            res.flatMap((r) => r.metas),
          ),
          nextPage: initialPages + 1,
          status: "ready",
          loadingMore: false,
          exhausted: !res[res.length - 1]?.more,
        });
      })
      .catch(() => {
        if (reqRef.current === my) {
          setGrid({
            resetKey,
            enabled,
            initialPages,
            retry,
            items: [],
            nextPage: initialPages + 1,
            status: "error",
            loadingMore: false,
            exhausted: false,
          });
        }
      });
  }, [resetKey, enabled, initialPages, retry]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhausted || status !== "ready" || !enabled) return;
    const my = reqRef.current;
    loadingRef.current = true;
    setGrid((prev) => (prev ? { ...prev, loadingMore: true } : prev));
    fetchRef
      .current(nextPage)
      .then((res) => {
        if (reqRef.current !== my) return;
        setGrid((prev) =>
          prev
            ? {
                ...prev,
                items: mergeUnique(prev.items, res.metas),
                nextPage: prev.nextPage + 1,
                exhausted: !res.more,
              }
            : prev,
        );
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
        if (reqRef.current === my) {
          setGrid((prev) => (prev ? { ...prev, loadingMore: false } : prev));
        }
      });
  }, [exhausted, status, enabled, nextPage]);

  if (status === "loading") return <GridSkeleton />;
  if (status === "error") return <ErrorState onRetry={() => setRetry((r) => r + 1)} />;
  if (items.length === 0) return <>{emptyState}</>;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] gap-x-3 gap-y-5 px-4">
        {items.map((m) => (
          <GridPoster key={m.id} meta={m} onOpen={onOpenDetail} />
        ))}
      </div>
      {!exhausted && <LoadMoreSentinel onLoadMore={loadMore} />}
      {loadingMore && <MoreSpinner />}
    </>
  );
}

function GridPoster({ meta, onOpen }: { meta: Meta; onOpen: (m: Meta) => void }) {
  const t = useT();
  const settings = useSettingsSelector((s) => ({ rpdbKey: s.rpdbKey }));
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(meta)}
      aria-label={t("View {title}", { title: meta.name })}
      className="text-start transition-transform duration-150 active:scale-[0.96]"
    >
      <Poster
        src={src}
        onError={onError}
        seed={meta.id}
        ratio="portrait"
        lazy
        className="rounded-lg"
      >
        {!settings.rpdbKey && meta.imdbRating && (
          <span className="pointer-events-none absolute bottom-1.5 end-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">
            <Star size={9} strokeWidth={0} fill="#f5c518" className="text-[#f5c518]" />
            {meta.imdbRating}
          </span>
        )}
      </Poster>
      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
        {meta.name}
      </p>
    </button>
  );
}

function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoadMore);
  useLayoutEffect(() => {
    cb.current = onLoadMore;
  }, [onLoadMore]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cb.current();
      },
      { root: null, rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="h-1 w-full" />;
}

function MoreSpinner() {
  return (
    <div className="flex justify-center gap-1.5 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink/30 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] gap-x-3 gap-y-5 px-4"
      aria-hidden
    >
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-lg bg-elevated/40 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[19px] font-medium text-ink">
          {t("Couldn't load this catalog")}
        </h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          {t("Harbor couldn't reach the catalog servers. Check your connection and try again.")}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
      >
        {t("Try again")}
      </button>
    </div>
  );
}
