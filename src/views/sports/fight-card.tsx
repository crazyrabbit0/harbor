import { useEffect, useState } from "react";
import { ChevronDown, ArrowRight } from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";
import { useT, useUiLanguage } from "@/lib/i18n";
import type { SportsGame } from "@/lib/sports/espn";
import { parseFightInfo, type FightInfo, type FightSection } from "@/lib/sports/fight-card";
import { CompetitionAthletePortrait } from "./competition-athlete-portrait";
import "./competition-athletes.css";
import { hubLeague } from "@/lib/sports/hub-data";

const cache = new Map<string, { at: number; info: FightInfo }>();
const isStale = (entry: { at: number } | undefined) => !entry || Date.now() - entry.at > 3600000;
const leagueSlug = (league: string) => hubLeague(league)?.path.split("/").at(-1);

// Null when the bout has no fetchable league or the request fails; callers keep the bout names then.
async function fightInfoFor(
  game: SportsGame,
  event: string,
  bout: string,
  signal: AbortSignal,
): Promise<FightInfo | null> {
  let entry = cache.get(game.id);
  try {
    if (isStale(entry)) {
      const league = leagueSlug(game.league);
      if (!league || !/^[a-z0-9-]+$/.test(league)) return null;
      const response = await safeFetch(
        `https://sports.core.api.espn.com/v2/sports/mma/leagues/${league}/events/${event}/competitions/${bout}`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
        },
      );
      if (!response.ok) return null;
      entry = {
        at: Date.now(),
        info: parseFightInfo(await response.json()),
      };
      cache.set(game.id, entry);
      while (cache.size > 200) cache.delete(cache.keys().next().value!);
    }
    return entry!.info;
  } catch {
    /* Keep the available bout names when the card metadata is unavailable. */
    return null;
  }
}

export function FightCard({
  games,
  onOpen,
  expanded = false,
}: {
  games: SportsGame[];
  onOpen: (game: SportsGame) => void;
  expanded?: boolean;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const [open, setOpen] = useState(expanded);
  const [info, setInfo] = useState<Record<string, FightInfo>>({});
  const identity = games.map((game) => game.id).join(",");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const cursor = { next: 0 };
    const run = async () => {
      while (cursor.next < games.length && !controller.signal.aborted) {
        const game = games[cursor.next++];
        const [event, bout] = game.id.split("|");
        if (!/^\d+$/.test(event) || !/^\d+$/.test(bout)) continue;
        const fetched = await fightInfoFor(game, event, bout, controller.signal);
        if (fetched && !controller.signal.aborted)
          setInfo((previous) => ({ ...previous, [game.id]: fetched }));
      }
    };
    void Promise.all(Array.from({ length: 3 }, run));
    return () => controller.abort();
  }, [identity, open]);
  const first = games[0];
  const sections: FightSection[] = ["Main card", "Prelims", "Early prelims", "Fight card"];
  const content = (
    <div className="sh-fight-sections">
      {sections.map((section) => {
        const bouts = games
          .filter((game) => (info[game.id]?.section ?? "Fight card") === section)
          .sort((a, b) => (info[a.id]?.order ?? 99) - (info[b.id]?.order ?? 99));
        if (!bouts.length) return null;
        return (
          <section key={section}>
            <h4>
              {t(section)}
              <small>
                {new Date(Math.min(...bouts.map((game) => game.startMs))).toLocaleTimeString(
                  locale,
                  {
                    hour: "numeric",
                    minute: "2-digit",
                  },
                )}
              </small>
            </h4>
            <div className="sh-bout-list">
              {bouts.map((game) => (
                <button key={game.id} onClick={() => onOpen(game)}>
                  <CompetitionAthletePortrait
                    name={game.home.name}
                    league={game.league}
                    group="combat"
                    athlete={{
                      id: game.home.id,
                      name: game.home.name,
                      image: game.home.logo,
                      source: "espn",
                    }}
                  />
                  <span>
                    <strong>
                      {game.home.name} <em>{t("vs")}</em> {game.away.name}
                    </strong>
                    <small>{info[game.id]?.weight || game.detail}</small>
                  </span>
                  <CompetitionAthletePortrait
                    name={game.away.name}
                    league={game.league}
                    group="combat"
                    athlete={{
                      id: game.away.id,
                      name: game.away.name,
                      image: game.away.logo,
                      source: "espn",
                    }}
                  />
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
  if (expanded) return content;
  return (
    <details className="sh-fight-card" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary tabIndex={0}>
        <span>
          <strong>{first.context?.name || first.home.name}</strong>
          <small>{first.context?.venue}</small>
        </span>
        <span>{t("{n} bouts", { n: games.length })}</span>
        <ChevronDown size={18} />
      </summary>
      {open && content}
    </details>
  );
}
