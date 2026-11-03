import { useState } from "react";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { aiFindEpisodes, type EpisodeCandidate } from "@/lib/ai-episode-search";

function matchedNumbers(refs: { season: number; episode: number }[], episodes: KitsuEpisode[]) {
  const nums = new Set<number>();
  for (const r of refs) {
    const ep = episodes.find(
      (e) =>
        (e.imdbSeason ?? e.seasonNumber ?? 1) === r.season &&
        (e.imdbEpisode ?? e.number) === r.episode,
    );
    if (ep) nums.add(ep.number);
  }
  return nums;
}

export function useAnimeAiSearch(
  showName: string,
  episodes: KitsuEpisode[],
  key: string,
  model: string,
  isGroq: boolean,
) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [matched, setMatched] = useState<Set<number> | null>(null);

  const run = async (query: string) => {
    const q = query.trim();
    if (!q || status === "loading") return;
    setStatus("loading");
    const candidates: EpisodeCandidate[] = episodes.map((e) => ({
      season: e.imdbSeason ?? e.seasonNumber ?? 1,
      episode: e.imdbEpisode ?? e.number,
      name: e.title,
      overview: e.synopsis,
    }));
    try {
      const refs = await aiFindEpisodes(key, model, isGroq, showName, candidates, q);
      setMatched(matchedNumbers(refs, episodes));
    } catch {
      setMatched(new Set());
    }
    setStatus("done");
  };

  const reset = () => {
    setStatus("idle");
    setMatched(null);
  };

  return { status, matched, run, reset };
}
