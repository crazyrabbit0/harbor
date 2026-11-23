import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "@/components/icons/music-icons";
import { MusicCoverCard } from "@/components/music/music-cover-card";
import { MusicSectionEmpty, MusicSectionError } from "@/components/music/music-track-grid";
import { useT } from "@/lib/i18n";
import { loadMusicDiscoveryGenres } from "@/lib/music/discovery";
import type { MusicDiscoveryGenre } from "@/lib/music/genre-catalog";
import {
  topPlaylistKey,
  topPlaylistLanes,
  topPlaylistTitleKey,
  type TopPlaylistItem,
  type TopPlaylistLane,
} from "@/lib/music/top-playlists";
import type { MusicCatalogItem } from "@/lib/music/types";
import "./music-tastes.css";

const LANES_PER_STEP = 4;
const OPENING_STEPS = 2;
const SKELETON_CARDS = 15;
const EMPTY_PLAYLIST_ITEMS: TopPlaylistItem[] = [];

type PlaylistFeedTarget = {
  genreId: number | null;
  genres: MusicDiscoveryGenre[];
  retry: number;
};

type PlaylistFeedState = PlaylistFeedTarget & {
  items: TopPlaylistItem[];
  status: "loading" | "ready" | "error";
  drained: boolean;
  more: boolean;
};

function sameTarget(left: PlaylistFeedTarget, right: PlaylistFeedTarget): boolean {
  return (
    left.genreId === right.genreId && left.genres === right.genres && left.retry === right.retry
  );
}

function PlaylistGenreFilters({
  genres,
  selected,
  onSelect,
}: {
  genres: MusicDiscoveryGenre[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const t = useT();
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const measure = () => {
      const offset = Math.abs(el.scrollLeft);
      setEdges({ start: offset <= 1, end: offset >= el.scrollWidth - el.clientWidth - 1 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [genres]);

  const move = (step: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({
      left: (rtl ? -1 : 1) * step * el.clientWidth * 0.85,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  const overflow = !edges.start || !edges.end;

  return (
    <div
      className="music-top-playlists-filter-nav"
      role="group"
      aria-label={t("music.explore.genres")}
    >
      {overflow && (
        <button
          type="button"
          className="music-top-playlists-filter-arrow"
          onClick={() => move(-1)}
          disabled={edges.start}
          aria-label={t("common.previous")}
          aria-controls={id}
        >
          <ChevronLeft className="dir-icon" size={18} aria-hidden />
        </button>
      )}
      <div ref={rail} id={id} className="music-top-playlists-filter">
        <div className="music-top-playlists-filter-pills">
          <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)}>
            {t("music.filter.all")}
          </button>
          {genres.map((genre) => (
            <button
              key={genre.id}
              type="button"
              aria-pressed={selected === genre.id}
              onClick={() => onSelect(genre.id)}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>
      {overflow && (
        <button
          type="button"
          className="music-top-playlists-filter-arrow"
          onClick={() => move(1)}
          disabled={edges.end}
          aria-label={t("common.next")}
          aria-controls={id}
        >
          <ChevronRight className="dir-icon" size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}

function TopPlaylistsSkeleton() {
  return (
    <div className="music-top-playlists-grid" aria-hidden="true">
      {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
        <div key={index} className="music-top-playlists-ghost">
          <span className="music-top-playlists-ghost-cover" />
          <span className="music-top-playlists-ghost-line" />
          <span className="music-top-playlists-ghost-line music-top-playlists-ghost-sub" />
        </div>
      ))}
    </div>
  );
}

export function MusicTopPlaylists({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const [genres, setGenres] = useState<MusicDiscoveryGenre[]>([]);
  const [genreId, setGenreId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [feed, setFeed] = useState<PlaylistFeedState>(() => ({
    genreId: null,
    genres: [],
    retry: 0,
    items: EMPTY_PLAYLIST_ITEMS,
    status: "loading",
    drained: false,
    more: false,
  }));
  const lanes = useRef<TopPlaylistLane[]>([]);
  const cursor = useRef(0);
  const seen = useRef(new Set<string>());
  const live = useRef(true);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let alive = true;
    void loadMusicDiscoveryGenres()
      .then((all) => {
        if (!alive) return;
        setGenres(
          [...all].sort(
            (left, right) => Number(Boolean(right.deezerId)) - Number(Boolean(left.deezerId)),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const absorb = useCallback(
    (
      batch: PromiseSettledResult<TopPlaylistItem[]>[],
      target: PlaylistFeedTarget,
      isDrained: boolean,
    ) => {
      const fresh: TopPlaylistItem[] = [];
      for (const result of batch) {
        if (result.status !== "fulfilled") continue;
        for (const item of result.value) {
          const id = topPlaylistKey(item);
          const title = topPlaylistTitleKey(item);
          if (seen.current.has(id) || seen.current.has(title)) continue;
          seen.current.add(id);
          seen.current.add(title);
          fresh.push(item);
        }
      }
      if (fresh.length) {
        setFeed((previous) =>
          sameTarget(previous, target)
            ? { ...previous, items: [...previous.items, ...fresh], drained: isDrained }
            : {
                ...target,
                items: fresh,
                status: "loading",
                drained: isDrained,
                more: false,
              },
        );
      }
    },
    [],
  );

  const pull = useCallback(
    async (target: PlaylistFeedTarget) => {
      const slice = lanes.current.slice(cursor.current, cursor.current + LANES_PER_STEP);
      cursor.current += slice.length;
      const isDrained = cursor.current >= lanes.current.length;
      setFeed((previous) =>
        sameTarget(previous, target)
          ? { ...previous, drained: isDrained }
          : {
              ...target,
              items: EMPTY_PLAYLIST_ITEMS,
              status: "loading",
              drained: isDrained,
              more: false,
            },
      );
      if (!slice.length) return;
      const batch = await Promise.allSettled(slice.map((lane) => lane.load()));
      if (live.current) absorb(batch, target, isDrained);
    },
    [absorb],
  );

  useEffect(() => {
    live.current = true;
    seen.current = new Set();
    cursor.current = 0;
    lanes.current = [];
    const target: PlaylistFeedTarget = { genreId, genres, retry };
    const picked = genreId === null ? null : (genres.find((g) => g.id === genreId) ?? null);
    void (async () => {
      const work = async () => {
        lanes.current = await topPlaylistLanes(picked);
        for (let step = 0; step < OPENING_STEPS; step += 1) await pull(target);
        if (live.current) {
          setFeed((previous) =>
            sameTarget(previous, target)
              ? { ...previous, status: "ready" }
              : {
                  ...target,
                  items: EMPTY_PLAYLIST_ITEMS,
                  status: "ready",
                  drained: cursor.current >= lanes.current.length,
                  more: false,
                },
          );
        }
      };
      await work().catch(() => {
        if (live.current) {
          setFeed((previous) =>
            sameTarget(previous, target)
              ? { ...previous, status: "error" }
              : {
                  ...target,
                  items: EMPTY_PLAYLIST_ITEMS,
                  status: "error",
                  drained: false,
                  more: false,
                },
          );
        }
      });
    })();
    return () => {
      live.current = false;
    };
  }, [genreId, genres, pull, retry]);

  const current = sameTarget(feed, { genreId, genres, retry }) ? feed : null;
  const items = current ? current.items : EMPTY_PLAYLIST_ITEMS;
  const status = current ? current.status : "loading";
  const more = current ? current.more : false;
  const drained = current ? current.drained : false;

  const loadMore = () => {
    if (more) return;
    const target: PlaylistFeedTarget = { genreId, genres, retry };
    setFeed((previous) =>
      sameTarget(previous, target)
        ? { ...previous, more: true }
        : {
            ...target,
            items: EMPTY_PLAYLIST_ITEMS,
            status: "loading",
            drained,
            more: true,
          },
    );
    void pull(target).finally(() => {
      if (live.current) {
        setFeed((previous) =>
          sameTarget(previous, target) ? { ...previous, more: false } : previous,
        );
      }
    });
  };

  const exhausted = drained && status === "ready";

  return (
    <section className="music-tastes">
      <button type="button" className="music-tastes-back" data-music-inner-back onClick={onBack}>
        <ChevronLeft className="dir-icon" size={18} />
        {t("music.watch.back")}
      </button>
      <header className="music-top-playlists-head">
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold">
          {t("music.taste.playlists")}
        </h1>
        {status === "ready" && items.length > 0 && (
          <p>{t("music.search.resultCount", { count: items.length })}</p>
        )}
      </header>
      {genres.length > 0 && (
        <PlaylistGenreFilters genres={genres} selected={genreId} onSelect={setGenreId} />
      )}
      {status === "error" ? (
        <MusicSectionError onRetry={() => setRetry((value) => value + 1)} />
      ) : status === "loading" ? (
        <TopPlaylistsSkeleton />
      ) : items.length === 0 ? (
        <MusicSectionEmpty label={t("music.row.emptyRow")} />
      ) : (
        <>
          <div className="music-top-playlists-grid">
            {items.map((item) => (
              <MusicCoverCard
                key={topPlaylistKey(item)}
                item={item}
                onOpen={() => onOpen(item, items)}
              />
            ))}
          </div>
          {!exhausted && (
            <div className="music-top-playlists-more">
              <button type="button" onClick={loadMore} disabled={more}>
                {more ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" size={17} />
                ) : null}
                {t("music.library.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
