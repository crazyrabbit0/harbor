import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { queryIgdb } from "@/lib/games/atlas";
import { parseAtlasSummary, ROM_HACK_PLATFORMS, type AtlasRoute } from "@/lib/games/igdb-data";
import type { GameSummary } from "@/lib/games/types";
import { useSectionBack } from "@/lib/section-back";
import { GameArt } from "./game-art";

export function GameHackBaseFilter({
  route,
  browse,
}: {
  route: AtlasRoute;
  browse: (route: AtlasRoute) => void;
}) {
  const t = useT(),
    ref = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [prevOpen, setPrevOpen] = useState(false),
    [query, setQuery] = useState(""),
    [result, setResult] = useState<{
      key: string;
      rows: GameSummary[];
      failed: boolean;
    } | null>(null);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setResult(null);
  }
  const settled = open && result?.key === query,
    busy = open && !settled,
    failed = settled && result.failed,
    rows = settled ? result.rows : [];
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useSectionBack(close, open);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector("input")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const needle = query.trim().slice(0, 120).replace(/["\\]/g, " ");
    const timer = setTimeout(
      () => {
        void queryIgdb(
          `fields name,cover.image_id,platforms.name; ${needle ? `search "${needle}";` : ""} where game_type = (0,8,9) & platforms = (${ROM_HACK_PLATFORMS.join(",")}) & cover != null; ${needle ? "" : "sort total_rating_count desc;"} limit 16;`,
          controller.signal,
        ).then(
          (results) => {
            if (!controller.signal.aborted) {
              setResult({
                key: query,
                rows: results.map(parseAtlasSummary).filter((g): g is GameSummary => !!g),
                failed: false,
              });
            }
          },
          () => {
            if (!controller.signal.aborted) {
              setResult({ key: query, rows: [], failed: true });
            }
          },
        );
      },
      needle ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);
  const select = (game?: GameSummary) => {
    close();
    browse({ kind: route.kind, name: game?.name ?? t("games.hub.title"), baseGame: game });
  };
  return (
    <div
      className="games-hack-base-filter"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="games-button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {route.baseGame?.name ?? t("games.hub.allOriginals")}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="games-hack-base-menu">
          <div className="games-search">
            <Search size={16} />
            <input
              aria-label={t("games.hub.searchOriginal")}
              placeholder={t("games.hub.searchOriginal")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="games-icon-button" aria-label={t("common.close")} onClick={close}>
              <X size={15} />
            </button>
          </div>
          <button onClick={() => select()}>{t("games.hub.allOriginals")}</button>
          <div className="games-hack-base-results" aria-busy={busy}>
            {busy ? (
              <p role="status">{t("common.loading")}</p>
            ) : failed ? (
              <p role="alert">{t("games.atlas.error")}</p>
            ) : !rows.length ? (
              <p>{t("games.noResults")}</p>
            ) : (
              rows.map((game) => (
                <button key={game.id} onClick={() => select(game)}>
                  <GameArt src={game.portrait ?? game.capsule} />
                  <span>
                    <strong>{game.name}</strong>
                    <small>{game.platforms.join(" · ")}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
