import { useCallback, useEffect, useState } from "react";
import {
  tmdbEpisodeGroup,
  tmdbEpisodeGroups,
  tmdbSeasonEpisodes,
  type Episode,
  type StoryArc,
} from "@/lib/providers/tmdb";

export type ArcGroupsState = {
  arcs: StoryArc[];
  activeArcId: string | null;
  setActiveArcId: (id: string) => void;
  hasArcs: boolean;
  episodes: Episode[];
  loading: boolean;
};

const EMPTY_ARCS: StoryArc[] = [];
const EMPTY_EPISODES: Episode[] = [];

export function useArcGroups({
  tvId,
  tmdbKey,
  enabled,
}: {
  tvId: number;
  tmdbKey: string;
  enabled: boolean;
}): ArcGroupsState {
  const groupKey = enabled && tvId && tmdbKey ? `${tvId}:${tmdbKey}` : "";
  const [groupState, setGroupState] = useState<{ key: string; arcs: StoryArc[] } | null>(null);
  const [selectedArc, setSelectedArc] = useState<{ key: string; id: string } | null>(null);
  const [epState, setEpState] = useState<{ key: string; episodes: Episode[] } | null>(null);

  const arcs = groupKey && groupState?.key === groupKey ? groupState.arcs : EMPTY_ARCS;
  const activeArcId =
    arcs.length === 0
      ? null
      : selectedArc?.key === groupKey && arcs.some((a) => a.id === selectedArc.id)
        ? selectedArc.id
        : arcs[0].id;
  const setActiveArcId = useCallback(
    (id: string) => {
      if (groupKey) setSelectedArc({ key: groupKey, id });
    },
    [groupKey],
  );

  useEffect(() => {
    if (!groupKey) return;
    let cancelled = false;
    void (async () => {
      const group = await tmdbEpisodeGroups(tmdbKey, tvId);
      if (cancelled || !group) return;
      const list = await tmdbEpisodeGroup(tmdbKey, group.id);
      if (cancelled || list.length === 0) return;
      setGroupState({ key: groupKey, arcs: list });
    })();
    return () => {
      cancelled = true;
    };
  }, [groupKey, tvId, tmdbKey]);

  const epKey = groupKey && activeArcId ? `${groupKey}:${activeArcId}` : "";
  const activeArc = activeArcId ? arcs.find((a) => a.id === activeArcId) : undefined;

  useEffect(() => {
    if (!epKey || !activeArc) return;
    let cancelled = false;
    void (async () => {
      const seasonsNeeded = [...new Set(activeArc.episodes.map((e) => e.season))];
      const bySeason = new Map<number, Map<number, Episode>>();
      await Promise.all(
        seasonsNeeded.map(async (s) => {
          const eps = await tmdbSeasonEpisodes(tmdbKey, tvId, s);
          const m = new Map<number, Episode>();
          for (const ep of eps) m.set(ep.episodeNumber, ep);
          bySeason.set(s, m);
        }),
      );
      if (cancelled) return;
      const ordered: Episode[] = [];
      for (const ref of activeArc.episodes) {
        const ep = bySeason.get(ref.season)?.get(ref.episode);
        if (ep) ordered.push(ep);
      }
      setEpState({ key: epKey, episodes: ordered });
    })();
    return () => {
      cancelled = true;
    };
  }, [epKey, tmdbKey, tvId, activeArc]);

  return {
    arcs,
    activeArcId,
    setActiveArcId,
    hasArcs: enabled && arcs.length > 0,
    episodes: epKey && epState?.key === epKey ? epState.episodes : EMPTY_EPISODES,
    loading: epKey !== "" && epState?.key !== epKey,
  };
}
