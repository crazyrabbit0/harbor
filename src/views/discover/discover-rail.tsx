import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { RailDef } from "@/lib/feed";
import { FeedShelf } from "@/components/feed-shelf";
import { ScrollRootContext } from "@/components/row";
import { useT } from "@/lib/i18n";
import { useViewActions } from "@/lib/view";

export function Rail({
  active = true,
  railId,
  allRails,
  deduped,
  loadMore,
  ensureLoaded,
  titleOverride,
}: {
  active?: boolean;
  railId: string;
  allRails: RailDef[];
  deduped: Record<string, Meta[] | null>;
  loadMore: (id: string) => void;
  ensureLoaded?: (id: string) => void;
  titleOverride?: string;
}) {
  const { openGrid } = useViewActions();
  const t = useT();
  const root = useContext(ScrollRootContext);
  const element = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!active || !root || !element.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const el = element.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Parking the page is not scrolling away; flipping to far there redraws the rail's whole row.
        if (!entry.isIntersecting && el.closest("[data-layer-inactive]")) return;
        setNear(entry.isIntersecting);
      },
      {
        root,
        rootMargin: "1000px 0px",
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, root]);
  useEffect(() => {
    if (!active || !near) return;
    ensureLoaded?.(railId);
    // Bounded retries for transient failures; successful pages are a no-op.
    const retry = window.setTimeout(() => ensureLoaded?.(railId), 5000);
    const lastRetry = window.setTimeout(() => ensureLoaded?.(railId), 15000);
    return () => {
      clearTimeout(retry);
      clearTimeout(lastRetry);
    };
  }, [active, near, railId, ensureLoaded]);
  const def = allRails.find((r) => r.id === railId);
  const items = deduped[railId] ?? null;
  const title = def ? (titleOverride === undefined ? t(def.shelf.title) : titleOverride) : "";
  const kicker = def?.shelf.kicker ? t(def.shelf.kicker) : def?.shelf.kicker;
  const shelf = useMemo(() => (def ? { ...def.shelf, title, kicker } : null), [def, title, kicker]);
  // Callbacks read the latest values through a ref so parking the page does not hand the row new props.
  const latest = useRef({ active, loadMore, railId, def, items, title });
  latest.current = { active, loadMore, railId, def, items, title };
  const onEndReached = useCallback(() => {
    const l = latest.current;
    if (l.active) l.loadMore(l.railId);
  }, []);
  const onViewAll = useCallback(() => {
    const l = latest.current;
    if (!l.def) return;
    const d = l.def;
    openGrid({ title: l.title, fetcher: (page) => d.fetch(page), initial: l.items ?? undefined });
  }, [openGrid]);
  if (!def || !shelf) return null;
  return (
    <div
      ref={element}
      data-scroll-anchor={`discover:${railId}`}
      className={items?.length === 0 ? "hidden" : undefined}
      onFocusCapture={() => setNear(true)}
    >
      <FeedShelf
        shelf={shelf}
        items={items}
        onEndReached={near && items !== null ? onEndReached : undefined}
        scrollKey={`discover:${railId}`}
        onViewAll={onViewAll}
      />
    </div>
  );
}
