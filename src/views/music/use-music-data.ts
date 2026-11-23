import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { errorText } from "@/components/music/music-connections/connection-row";
import { loadHomeRows } from "@/lib/music/catalog";
import { getLastFmStatus, type LastFmStatus } from "@/lib/music/lastfm";
import { loadMusicLibrary, type MusicLibrarySnapshot } from "@/lib/music/library";
import { loadFreshFromArtists } from "@/lib/music/sources";
import type { MusicCatalogRow, MusicTrack } from "@/lib/music/types";
import { CATALOG_REQUEST_TIMEOUT_MS, withTimeout } from "@/lib/progressive-rows";

export type MusicFeedStatus = "loading" | "ready" | "error";

type HomeEntry = { key: string; row: MusicCatalogRow };

export type MusicData = {
  homeRows: MusicCatalogRow[];
  homeStatus: MusicFeedStatus;
  homeError: string;
  library: MusicLibrarySnapshot | null;
  libraryStatus: MusicFeedStatus;
  libraryError: string;
  fresh: MusicTrack[];
  freshStatus: MusicFeedStatus;
  freshError: string;
  lastfm: LastFmStatus | null;
  reload: () => void;
  reloadFresh: () => void;
};

const HOME_TIMEOUT_MS = CATALOG_REQUEST_TIMEOUT_MS * 2;
const EMPTY_TRACKS: MusicTrack[] = [];

export function useMusicData(recents: MusicTrack[]): MusicData {
  const [entries, setEntries] = useState<HomeEntry[]>([]);
  const [homeState, setHomeState] = useState<{
    attempt: number;
    status: MusicFeedStatus;
    error: string;
  }>({ attempt: 0, status: "loading", error: "" });
  const [library, setLibrary] = useState<MusicLibrarySnapshot | null>(null);
  const [libraryState, setLibraryState] = useState<{
    attempt: number;
    status: MusicFeedStatus;
    error: string;
  }>({ attempt: 0, status: "loading", error: "" });
  const [lastfm, setLastfm] = useState<LastFmStatus | null>(null);
  const [freshTracks, setFreshTracks] = useState<MusicTrack[]>([]);
  const [freshState, setFreshState] = useState<{
    key: string;
    status: MusicFeedStatus;
    error: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [releaseRefresh, setReleaseRefresh] = useState(0);
  const reloadFresh = useCallback(() => setReleaseRefresh((value) => value + 1), []);
  useEffect(() => {
    const refresh = () => setReleaseRefresh((value) => value + 1);
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const generation = useRef(0);
  const recentsRef = useRef(recents);
  useLayoutEffect(() => {
    recentsRef.current = recents;
  }, [recents]);

  useEffect(() => {
    const run = ++generation.current;
    const live = () => generation.current === run;

    withTimeout(loadHomeRows(attempt > 0), HOME_TIMEOUT_MS)
      .then((rows) => {
        if (!live()) return;
        setEntries(rows.map((row) => ({ key: row.id, row })));
        setHomeState({ attempt, status: "ready", error: "" });
      })
      .catch((cause) => {
        if (!live()) return;
        setHomeState({ attempt, status: "error", error: errorText(cause) });
      });

    withTimeout(loadMusicLibrary(), CATALOG_REQUEST_TIMEOUT_MS)
      .then((snapshot) => {
        if (!live()) return;
        setLibrary(snapshot);
        setLibraryState({ attempt, status: "ready", error: "" });
      })
      .catch((cause) => {
        if (!live()) return;
        setLibraryState({ attempt, status: "error", error: errorText(cause) });
      });

    getLastFmStatus()
      .then((status) => {
        if (live()) setLastfm(status);
      })
      .catch(() => {
        if (live()) setLastfm({ connected: false, username: null });
      });

    return () => {
      generation.current += 1;
    };
  }, [attempt]);

  const historyKey = recents
    .slice(0, 50)
    .map((track) => track.id)
    .join("|");
  const freshKey = `${historyKey}\0${attempt}\0${releaseRefresh}`;

  useEffect(() => {
    if (!historyKey) return;
    let live = true;
    loadFreshFromArtists(recentsRef.current, 9, (tracks) => {
      if (live) setFreshTracks(tracks);
    })
      .then((tracks) => {
        if (!live) return;
        setFreshTracks(tracks);
        setFreshState({ key: freshKey, status: "ready", error: "" });
      })
      .catch((cause) => {
        if (!live) return;
        setFreshState({ key: freshKey, status: "error", error: errorText(cause) });
      });
    return () => {
      live = false;
    };
  }, [historyKey, attempt, releaseRefresh, freshKey]);

  const homeStatus: MusicFeedStatus = homeState.attempt === attempt ? homeState.status : "loading";
  const homeError = homeState.attempt === attempt ? homeState.error : "";
  const libraryStatus: MusicFeedStatus =
    libraryState.attempt === attempt ? libraryState.status : "loading";
  const libraryError = libraryState.attempt === attempt ? libraryState.error : "";
  const freshCurrent = historyKey && freshState?.key === freshKey ? freshState : null;
  const fresh = historyKey ? freshTracks : EMPTY_TRACKS;
  const freshStatus: MusicFeedStatus = !historyKey
    ? "ready"
    : freshCurrent
      ? freshCurrent.status
      : "loading";
  const freshError = !historyKey ? "" : (freshCurrent?.error ?? "");

  const homeRows = useMemo(() => entries.map((entry) => entry.row), [entries]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener("harbor:music-library-changed", reload);
    return () => window.removeEventListener("harbor:music-library-changed", reload);
  }, [reload]);

  return {
    homeRows,
    homeStatus,
    homeError,
    library,
    libraryStatus,
    libraryError,
    fresh,
    freshStatus,
    freshError,
    lastfm,
    reload,
    reloadFresh,
  };
}
