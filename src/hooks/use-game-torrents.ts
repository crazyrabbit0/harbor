import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { osClass } from "@/lib/platform";
import type { PreparationDraft } from "@/lib/games/download-preparation";
import type { StartTorrent } from "@/lib/generated/games-requests-ipc";
import {
  torrentError,
  type GameTorrent,
  type TorrentRequest,
  type TorrentSeedPolicy,
} from "@/lib/games/torrents";
import { downloadGame, type DownloadGame } from "@/lib/games/transfers";
import {
  forgetDownloadContext,
  mergeDownloadContext,
  refreshDownloadContexts,
  rememberDownloadContext,
} from "@/lib/games/download-context";

const loadOpener = () => import("@tauri-apps/plugin-opener");

export function useGameTorrents(profile: string, active: boolean) {
  const available = isTauri() && ["windows", "linux", "macos"].includes(osClass());
  const [state, setState] = useState<{ profile: string; records: GameTorrent[] }>({
    profile,
    records: [],
  });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string[]>([]),
    [draft, setDraft] = useState<string | null>(null);
  const [draftGame, setDraftGame] = useState<DownloadGame | undefined>();
  const [draftReview, setDraftReview] = useState(false);
  const owner = useRef(profile),
    live = useRef(true),
    revision = useRef(0),
    pending = useRef(new Set<string>()),
    events = useRef(new Map<string, GameTorrent>());
  useLayoutEffect(() => {
    owner.current = profile;
  }, [profile]);
  const valid = () => live.current && owner.current === profile;
  const refresh = async () => {
    if (!available) return;
    setLoading(true);
    setError("");
    await readRecords();
  };
  const readRecords = async () => {
    refreshDownloadContexts();
    const request = ++revision.current;
    events.current.clear();
    const latest = () => valid() && request === revision.current;
    await invoke<GameTorrent[]>("games_list_torrents", { profile })
      .then((records) => {
        if (latest())
          setState({
            profile,
            records: [
              ...new Map(
                [...records, ...events.current.values()]
                  .filter((item) => item.profile === profile)
                  .map((item) => [item.id, mergeDownloadContext("torrent", item)]),
              ).values(),
            ],
          });
      })
      .catch((reason: unknown) => {
        if (latest()) setError(torrentError(reason));
      })
      .finally(() => {
        if (latest()) setLoading(false);
      });
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [prevProfile, setPrevProfile] = useState(profile);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setBusy([]);
    setError("");
    setDraft(null);
    setDraftGame(undefined);
    setDraftReview(false);
  }
  const reading = active && available ? profile : null;
  const [prevReading, setPrevReading] = useState<string | null>(null);
  if (prevReading !== reading) {
    setPrevReading(reading);
    if (reading !== null) {
      setLoading(true);
      setError("");
    }
  }
  useEffect(() => {
    pending.current.clear();
    events.current.clear();
  }, [profile]);
  useEffect(() => {
    if (!available) return;
    let current = true;
    const stop = listen<GameTorrent>("games:torrent", ({ payload }) => {
      if (!current || !valid() || payload.profile !== profile) return;
      const record = mergeDownloadContext("torrent", payload);
      events.current.set(payload.id, payload);
      setState((previous) => ({
        profile,
        records: [
          ...(previous.profile === profile ? previous.records : []).filter(
            (item) => item.id !== record.id,
          ),
          record,
        ],
      }));
    }).catch(() => () => {});
    const stopQueue = listen<string>("games:download-queue", ({ payload }) => {
      if (current && valid() && payload === profile) void refresh();
    }).catch(() => () => {});
    return () => {
      current = false;
      void stop.then((unlisten) => unlisten());
      void stopQueue.then((unlisten) => unlisten());
    };
  }, [available, profile]);
  useEffect(() => {
    if (active && available) void readRecords();
  }, [active, available, profile]);
  const start = async (request: TorrentRequest, preparation?: PreparationDraft | null) => {
    const record = await invoke<GameTorrent>("games_start_torrent", {
      args: { ...request, game: downloadGame(request.game), profile } satisfies StartTorrent,
      preparation: preparation ?? null,
    });
    if (record.profile === profile)
      rememberDownloadContext(profile, "torrent", record.id, request.game);
    const enriched = mergeDownloadContext("torrent", record);
    if (valid() && record.profile === profile)
      setState((previous) => ({
        profile,
        records: [
          ...(previous.profile === profile ? previous.records : []).filter(
            (item) => item.id !== record.id,
          ),
          mergeDownloadContext("torrent", events.current.get(record.id) ?? record),
        ],
      }));
    return enriched;
  };
  const action = async (
    id: string,
    action: "pause" | "resume" | "remove" | "earlier" | "later",
  ) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setBusy([...pending.current]);
    setError("");
    return invoke("games_torrent_action", { profile, id, action })
      .then(async () => {
        if (action === "remove") forgetDownloadContext(profile, "torrent", id);
        if (valid()) {
          if (action === "remove") {
            events.current.delete(id);
            setState((previous) => ({
              ...previous,
              records: previous.records.filter((item) => item.id !== id),
            }));
          } else await refresh();
        }
        return valid();
      })
      .catch((reason: unknown) => {
        if (valid()) setError(torrentError(reason));
        return false;
      })
      .finally(release(id));
  };
  const release = (id: string) => () => {
    if (valid()) {
      pending.current.delete(id);
      setBusy([...pending.current]);
    }
  };
  const seed = async (id: string, policy: TorrentSeedPolicy) => {
    if (pending.current.has(id)) return false;
    pending.current.add(id);
    setBusy([...pending.current]);
    setError("");
    return invoke("games_seed_torrent", { profile, id, policy })
      .then(async () => {
        if (valid()) await refresh();
        return valid();
      })
      .catch((reason: unknown) => {
        if (valid()) setError(torrentError(reason));
        return false;
      })
      .finally(release(id));
  };
  const reveal = (record: GameTorrent) =>
    loadOpener()
      .then(({ revealItemInDir }) => revealItemInDir(record.destination))
      .catch((reason: unknown) => {
        if (valid()) setError(torrentError(reason));
      });
  return {
    profile,
    available,
    records: state.profile === profile ? state.records : [],
    loading,
    error,
    busy,
    draft,
    draftGame,
    draftReview,
    begin: (source = "", game?: DownloadGame, review = false) => {
      if (available) {
        setDraft(source);
        setDraftGame(downloadGame(game));
        setDraftReview(review);
      }
    },
    close: () => {
      setDraft(null);
      setDraftGame(undefined);
      setDraftReview(false);
    },
    refresh,
    start,
    action,
    seed,
    reveal,
    dismissError: () => setError(""),
  };
}
export type GameTorrents = ReturnType<typeof useGameTorrents>;
