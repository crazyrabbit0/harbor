import { useEffect, useState } from "react";
import { useSettingsSelector } from "@/lib/settings";
import { omdbScores, type OmdbScores } from "@/lib/providers/omdb";
import { useMdblistScores } from "@/lib/providers/mdblist";
import { harborImdbTitle } from "@/lib/providers/harbor-imdb";

export function useModalRatings(imdbId: string | null, mediaType: "movie" | "show") {
  const settings = useSettingsSelector((s) => ({ mdblistKey: s.mdblistKey, omdbKey: s.omdbKey }));
  const omdbKey = imdbId && settings.omdbKey ? `${imdbId}\0${settings.omdbKey}` : null;
  const [scoresResult, setScoresResult] = useState<{
    key: string;
    scores: OmdbScores | null;
  } | null>(null);
  const harborKey = imdbId?.startsWith("tt") ? imdbId : null;
  const [harborResult, setHarborResult] = useState<{
    key: string;
    rating: string | null;
  } | null>(null);
  const mdblist = useMdblistScores(settings.mdblistKey, imdbId, mediaType);

  useEffect(() => {
    if (!omdbKey || !imdbId || !settings.omdbKey) return;
    let cancelled = false;
    omdbScores(settings.omdbKey, imdbId)
      .then((s) => {
        if (!cancelled) setScoresResult({ key: omdbKey, scores: s });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [omdbKey, imdbId, settings.omdbKey]);

  useEffect(() => {
    if (!harborKey) return;
    let cancelled = false;
    harborImdbTitle(harborKey)
      .then((r) => {
        if (!cancelled && r != null) setHarborResult({ key: harborKey, rating: r.toFixed(1) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [harborKey]);

  const scores = omdbKey && scoresResult?.key === omdbKey ? scoresResult.scores : null;
  const harborImdb = harborKey && harborResult?.key === harborKey ? harborResult.rating : null;

  return { scores, mdblist, harborImdb };
}
