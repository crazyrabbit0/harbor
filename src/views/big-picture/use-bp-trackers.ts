import { useCallback, useEffect, useState } from "react";
import anilistLogo from "@/assets/anilist.png";
import malLogo from "@/assets/mal.png";
import simklLogo from "@/assets/simkl.png";
import type { Meta } from "@/lib/cinemeta";
import {
  deleteListEntry as anilistDelete,
  fetchListEntry as anilistFetch,
  saveListEntry as anilistSave,
} from "@/lib/anilist/mutations";
import { useAnilist } from "@/lib/anilist/provider";
import { resolveAnilistMediaId } from "@/lib/anilist/sync";
import type { MediaListStatus } from "@/lib/anilist/types";
import {
  deleteListEntry as malDelete,
  fetchListEntry as malFetch,
  resolveMalMediaId,
  saveListEntry as malSave,
} from "@/lib/mal/mutations";
import { useMal } from "@/lib/mal/provider";
import type { MalListStatus } from "@/lib/mal/types";
import { resolveSimklTarget } from "@/lib/simkl/ids";
import {
  clearSimklStatus,
  loadSimklStatusMap,
  MOVIE_STATUS_ORDER,
  setSimklStatus,
  SHOW_STATUS_ORDER,
  SIMKL_STATUS_LABELS,
  statusForId,
  type WatchlistStatus,
} from "@/lib/simkl/list-status";
import { useSimkl } from "@/lib/simkl/provider";
import type { SimklTarget } from "@/lib/simkl/types";

const ANIME_ID_RE = /^(kitsu|mal|anilist|anidb):/;

const ANILIST_LABELS: Record<MediaListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Plan to Watch",
  COMPLETED: "Completed",
  REPEATING: "Rewatching",
  PAUSED: "On Hold",
  DROPPED: "Dropped",
};

const ANILIST_ORDER: MediaListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "REPEATING",
  "PAUSED",
  "DROPPED",
];

const MAL_LABELS: Record<MalListStatus, string> = {
  watching: "Watching",
  plan_to_watch: "Plan to Watch",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
};

const MAL_ORDER: MalListStatus[] = ["watching", "plan_to_watch", "completed", "on_hold", "dropped"];

export type BpTrackerChoice = { id: string; label: string };

export type BpTracker = {
  key: string;
  name: string;
  logo: string;
  status: string | null;
  statusLabel: string | null;
  choices: BpTrackerChoice[];
  set: (id: string) => void;
  remove: (() => void) | null;
};

export function isBpAnime(meta: Meta): boolean {
  return meta.type === "anime" || ANIME_ID_RE.test(meta.id);
}

function useBpSimkl(
  harborId: string,
  type: "movie" | "series",
  enabled: boolean,
): BpTracker | null {
  const { isConnected } = useSimkl();
  const reqKey = isConnected && enabled && harborId ? `${harborId}:${type}` : "";
  const [state, setState] = useState<{
    key: string;
    target: SimklTarget | null;
    status: WatchlistStatus | null;
  }>({ key: "", target: null, status: null });

  const target = state.key === reqKey ? state.target : null;
  const status = state.key === reqKey ? state.status : null;

  useEffect(() => {
    if (!reqKey) return;
    let cancelled = false;
    void (async () => {
      const tgt = await resolveSimklTarget(harborId, type).catch(() => null);
      if (cancelled || !tgt) return;
      setState({ key: reqKey, target: tgt, status: null });
      const malKey = "ids" in tgt && tgt.ids.mal != null ? `mal:${tgt.ids.mal}` : null;
      const map = await loadSimklStatusMap().catch(() => null);
      if (cancelled || !map) return;
      const next = statusForId(map, harborId) ?? (malKey ? statusForId(map, malKey) : null);
      setState((cur) => (cur.key === reqKey ? { key: reqKey, target: tgt, status: next } : cur));
    })();
    return () => {
      cancelled = true;
    };
  }, [reqKey, harborId, type]);

  const set = useCallback(
    (id: string) => {
      if (!target) return;
      const next = id as WatchlistStatus;
      const prev = status;
      setState((cur) => (cur.key === reqKey ? { ...cur, status: next } : cur));
      void setSimklStatus(target, next)
        .then((saved) => setState((cur) => (cur.key === reqKey ? { ...cur, status: saved } : cur)))
        .catch(() => setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)));
    },
    [target, status, reqKey],
  );

  const remove = useCallback(() => {
    if (!target) return;
    const prev = status;
    setState((cur) => (cur.key === reqKey ? { ...cur, status: null } : cur));
    void clearSimklStatus(target).catch(() =>
      setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)),
    );
  }, [target, status, reqKey]);

  if (!isConnected || !enabled || !target) return null;
  const order = target.kind === "movie" ? MOVIE_STATUS_ORDER : SHOW_STATUS_ORDER;
  return {
    key: "simkl",
    name: "Simkl",
    logo: simklLogo,
    status,
    statusLabel: status ? SIMKL_STATUS_LABELS[status] : null,
    choices: order.map((s) => ({ id: s, label: SIMKL_STATUS_LABELS[s] })),
    set,
    remove: status ? remove : null,
  };
}

function useBpAnilist(harborId: string, enabled: boolean): BpTracker | null {
  const { isConnected } = useAnilist();
  const reqKey = isConnected && enabled && harborId ? harborId : "";
  const [state, setState] = useState<{
    key: string;
    mediaId: number | null;
    entryId: number | null;
    status: MediaListStatus | null;
  }>({ key: "", mediaId: null, entryId: null, status: null });

  const mediaId = state.key === reqKey ? state.mediaId : null;
  const entryId = state.key === reqKey ? state.entryId : null;
  const status = state.key === reqKey ? state.status : null;

  useEffect(() => {
    if (!reqKey) return;
    let cancelled = false;
    void (async () => {
      const id = await resolveAnilistMediaId(harborId).catch(() => null);
      if (cancelled || id == null) return;
      setState({ key: reqKey, mediaId: id, entryId: null, status: null });
      const info = await anilistFetch(id).catch(() => null);
      if (cancelled) return;
      setState((cur) =>
        cur.key === reqKey
          ? {
              key: reqKey,
              mediaId: id,
              entryId: info?.entry?.id ?? null,
              status: info?.entry?.status ?? null,
            }
          : cur,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reqKey, harborId]);

  const set = useCallback(
    (id: string) => {
      if (mediaId == null) return;
      const next = id as MediaListStatus;
      const prev = status;
      setState((cur) => (cur.key === reqKey ? { ...cur, status: next } : cur));
      void anilistSave({ mediaId, status: next })
        .then((saved) =>
          setState((cur) => (cur.key === reqKey ? { ...cur, entryId: saved.id } : cur)),
        )
        .catch(() => setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)));
    },
    [mediaId, status, reqKey],
  );

  const remove = useCallback(() => {
    if (entryId == null) return;
    const prev = status;
    setState((cur) => (cur.key === reqKey ? { ...cur, status: null } : cur));
    void anilistDelete(entryId)
      .then(() => setState((cur) => (cur.key === reqKey ? { ...cur, entryId: null } : cur)))
      .catch(() => setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)));
  }, [entryId, status, reqKey]);

  if (!isConnected || !enabled || mediaId == null) return null;
  return {
    key: "anilist",
    name: "AniList",
    logo: anilistLogo,
    status,
    statusLabel: status ? ANILIST_LABELS[status] : null,
    choices: ANILIST_ORDER.map((s) => ({ id: s, label: ANILIST_LABELS[s] })),
    set,
    remove: entryId != null ? remove : null,
  };
}

function useBpMal(harborId: string, enabled: boolean): BpTracker | null {
  const { isConnected } = useMal();
  const reqKey = isConnected && enabled && harborId ? harborId : "";
  const [state, setState] = useState<{
    key: string;
    malId: number | null;
    status: MalListStatus | null;
  }>({ key: "", malId: null, status: null });

  const malId = state.key === reqKey ? state.malId : null;
  const status = state.key === reqKey ? state.status : null;

  useEffect(() => {
    if (!reqKey) return;
    let cancelled = false;
    void (async () => {
      const id = await resolveMalMediaId(harborId).catch(() => null);
      if (cancelled || id == null) return;
      setState({ key: reqKey, malId: id, status: null });
      const info = await malFetch(id).catch(() => null);
      if (cancelled) return;
      setState((cur) =>
        cur.key === reqKey ? { key: reqKey, malId: id, status: info?.entry?.status ?? null } : cur,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reqKey, harborId]);

  const set = useCallback(
    (id: string) => {
      if (malId == null) return;
      const next = id as MalListStatus;
      const prev = status;
      setState((cur) => (cur.key === reqKey ? { ...cur, status: next } : cur));
      void malSave({ malId, status: next })
        .then((saved) =>
          setState((cur) => (cur.key === reqKey ? { ...cur, status: saved.status } : cur)),
        )
        .catch(() => setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)));
    },
    [malId, status, reqKey],
  );

  const remove = useCallback(() => {
    if (malId == null) return;
    const prev = status;
    setState((cur) => (cur.key === reqKey ? { ...cur, status: null } : cur));
    void malDelete(malId).catch(() =>
      setState((cur) => (cur.key === reqKey ? { ...cur, status: prev } : cur)),
    );
  }, [malId, status, reqKey]);

  if (!isConnected || !enabled || malId == null) return null;
  return {
    key: "mal",
    name: "MyAnimeList",
    logo: malLogo,
    status,
    statusLabel: status ? MAL_LABELS[status] : null,
    choices: MAL_ORDER.map((s) => ({ id: s, label: MAL_LABELS[s] })),
    set,
    remove: status ? remove : null,
  };
}

export function useBpTrackers(params: { meta: Meta; isMovie: boolean }): BpTracker[] {
  const { meta, isMovie } = params;
  const anime = isBpAnime(meta);
  const id = meta.id;
  const simkl = useBpSimkl(id, isMovie ? "movie" : "series", Boolean(id));
  const anilist = useBpAnilist(id, anime && Boolean(id));
  const mal = useBpMal(id, anime && Boolean(id));
  return [simkl, anilist, mal].filter((t): t is BpTracker => t !== null);
}
