import { useEffect, useState } from "react";
import { fetchEsportsFeed, type EsportsFeed, type EsportsGameId } from "@/lib/sports/esports-feeds";
import { fetchEsportsTeams, type EsportsTeam } from "@/lib/sports/esports-profiles";
import { fetchEsportsRankings, type EsportsRankings } from "@/lib/sports/esports-rankings";

const FEEDS: EsportsGameId[] = ["dota2", "lol", "valorant", "cs2", "rocketleague"];
export function useEsports(
  game: string,
  active: boolean,
  refresh: number,
  options: { profiles?: boolean; teamLogos?: boolean; games?: readonly EsportsGameId[] } = {},
) {
  const profiles = options.profiles !== false;
  const [feeds, setFeeds] = useState<Partial<Record<EsportsGameId, EsportsFeed>>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [teams, setTeams] = useState<EsportsTeam[]>([]);
  const [rankings, setRankings] = useState<EsportsRankings | null>(null);
  const [now, setNow] = useState(Date.now);
  const signature =
    game === "all"
      ? FEEDS.filter((key) => options.games === undefined || options.games.includes(key)).join(",")
      : FEEDS.includes(game as EsportsGameId)
        ? game
        : "";
  const isFeedActive = Boolean(active && signature);
  const [pendingFor, setPendingFor] = useState(isFeedActive);
  if (pendingFor !== isFeedActive) {
    setPendingFor(isFeedActive);
    if (!isFeedActive) setPending([]);
  }
  useEffect(() => {
    if (!active || !signature) return;
    const controller = new AbortController();
    const keys = signature.split(",") as EsportsGameId[];
    let busy = false;
    async function run() {
      if (busy || document.visibilityState !== "visible" || controller.signal.aborted) return;
      busy = true;
      setNow(Date.now());
      setPending(keys);
      // Independent providers publish as they finish; one outage cannot blank the arena.
      const cursor = { next: 0 };
      await Promise.all(
        Array.from({ length: Math.min(3, keys.length) }, async () => {
          while (cursor.next < keys.length && !controller.signal.aborted) {
            const key = keys[cursor.next++];
            const work = async () => {
              const result = await fetchEsportsFeed(key, {
                signal: controller.signal,
                force: refresh > 0,
              });
              if (!controller.signal.aborted) setFeeds((prev) => ({ ...prev, [key]: result }));
            };
            await work()
              .catch(() => {
                /* The provider returns its own unavailable state; aborts don't publish. */
              })
              .finally(() => {
                if (!controller.signal.aborted)
                  setPending((prev) => prev.filter((value) => value !== key));
              });
          }
        }),
      );
      busy = false;
    }
    void run();
    const timer = window.setInterval(run, 90_000);
    document.addEventListener("visibilitychange", run);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [signature, active, refresh]);
  const loadTeams =
    profiles ||
    (options.teamLogos === true &&
      signature.split(",").includes("dota2") &&
      !!feeds.dota2?.matches.length);
  const teamsKey =
    loadTeams && active && (game === "all" || game === "dota2") ? `${game}:${refresh}` : "";
  const [teamsOutcome, setTeamsOutcome] = useState<{ key: string; failed: boolean } | null>(null);
  const teamsLoading = !!teamsKey && teamsOutcome?.key !== teamsKey;
  const teamsFailed = !!teamsKey && teamsOutcome?.key === teamsKey && teamsOutcome.failed;
  useEffect(() => {
    if (!teamsKey) return;
    const controller = new AbortController();
    void fetchEsportsTeams(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setTeams(result);
          setTeamsOutcome({ key: teamsKey, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTeamsOutcome({ key: teamsKey, failed: true });
      });
    return () => controller.abort();
  }, [teamsKey]);
  const rankingsKey =
    profiles && active && (game === "all" || game === "cs2") ? `${game}:${refresh}` : "";
  const [rankingsOutcome, setRankingsOutcome] = useState<{ key: string; failed: boolean } | null>(
    null,
  );
  const rankingsLoading = !!rankingsKey && rankingsOutcome?.key !== rankingsKey;
  const rankingsFailed =
    !!rankingsKey && rankingsOutcome?.key === rankingsKey && rankingsOutcome.failed;
  useEffect(() => {
    if (!rankingsKey) return;
    const controller = new AbortController();
    void fetchEsportsRankings(controller.signal, refresh > 0)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRankings(result);
          setRankingsOutcome({ key: rankingsKey, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRankingsOutcome({ key: rankingsKey, failed: true });
      });
    return () => controller.abort();
  }, [rankingsKey, refresh]);
  return {
    feeds,
    pending,
    teams,
    teamsLoading,
    teamsFailed,
    rankings,
    rankingsLoading,
    rankingsFailed,
    now,
  };
}
