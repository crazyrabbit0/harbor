import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { pushBackHandler } from "@/lib/back-intercept";
import { searchStudios } from "@/lib/games/studios";
import type { AtlasGame, GameConnection } from "@/lib/games/igdb-data";

export function RomStudioFilter({
  value,
  games,
  onChange,
}: {
  value?: number;
  games: AtlasGame[];
  onChange: (id?: number) => void;
}) {
  const t = useT(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const incoming = games.flatMap((game) => [...game.developers, ...game.publishers]);
  const key = incoming.map((item) => item.id).join(",");
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [known, setKnown] = useState<GameConnection[]>(() =>
      incoming.length ? [...new Map(incoming.map((item) => [item.id, item])).values()] : [],
    ),
    [attempt, setAttempt] = useState(0);
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    if (incoming.length) {
      setKnown((old) => [
        ...new Map([...old, ...incoming].map((item) => [item.id, item])).values(),
      ]);
    }
  }
  const activeSearch = open && query.trim().length >= 2;
  const searchKey = `${open}:${query}:${attempt}`;
  const [searchState, setSearchState] = useState<{
    key: string;
    results: GameConnection[];
    failed: boolean;
    done: boolean;
  }>({ key: "", results: [], failed: false, done: false });
  const searchMatched = searchState.key === searchKey,
    results = activeSearch && searchMatched ? searchState.results : [],
    failed = activeSearch && searchMatched ? searchState.failed : false,
    busy = activeSearch && !(searchMatched && searchState.done);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const back = pushBackHandler(() => {
      close();
      return true;
    });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      back();
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (!activeSearch) return;
    const request = new AbortController();
    const timer = setTimeout(
      () =>
        void searchStudios(query, request.signal).then(
          (rows) => {
            if (!request.signal.aborted) {
              setSearchState({ key: searchKey, results: rows, failed: false, done: true });
              setKnown((old) => [
                ...new Map([...old, ...rows].map((item) => [item.id, item])).values(),
              ]);
            }
          },
          () => {
            if (!request.signal.aborted) {
              setSearchState({ key: searchKey, results: [], failed: true, done: true });
            }
          },
        ),
      300,
    );
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [activeSearch, query, searchKey]);
  const options = [
    ...new Map(
      [...known, ...results]
        .filter(
          (item) => !query || item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .map((item) => [item.id, item]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div
      ref={root}
      className="games-rom-studio-filter"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (["ArrowDown", "ArrowUp"].includes(event.key) && open) {
          event.preventDefault();
          const items = [
              ...(root.current?.querySelectorAll<HTMLElement>("input, [role=option]") ?? []),
            ],
            current = items.indexOf(document.activeElement as HTMLElement);
          items[
            (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="games-text-action"
        aria-label={t("games.roms.studio")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((old) => !old)}
      >
        {known.find((item) => item.id === value)?.name ?? t("games.roms.allStudios")}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="games-rom-studio-menu">
          <label className="games-search">
            <Search size={15} />
            <input
              ref={input}
              aria-label={t("games.roms.studio")}
              placeholder={t("games.roms.studio")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div role="listbox" aria-label={t("games.roms.studio")}>
            <button
              role="option"
              aria-selected={value === undefined}
              onClick={() => {
                onChange(undefined);
                close();
              }}
            >
              {t("games.roms.allStudios")}
              {value === undefined && <Check size={14} />}
            </button>
            {options.map((item) => (
              <button
                key={item.id}
                role="option"
                aria-selected={value === item.id}
                onClick={() => {
                  onChange(item.id);
                  close();
                }}
              >
                {item.name}
                {value === item.id && <Check size={14} />}
              </button>
            ))}
          </div>
          {busy && <span role="status">{t("common.loading")}</span>}
          {failed && (
            <button className="games-text-action" onClick={() => setAttempt((old) => old + 1)}>
              {t("common.retry")}
            </button>
          )}
          {!busy && !failed && !options.length && <span role="status">{t("games.noResults")}</span>}
        </div>
      )}
    </div>
  );
}
