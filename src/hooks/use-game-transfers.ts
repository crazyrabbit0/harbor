import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { attempt } from "./attempt";
import type { ReplacementFile } from "@/lib/games/transfer-relink";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { osClass } from "@/lib/platform";
import {
  downloadFilename,
  downloadName,
  downloadGame,
  transferError,
  validateDownloadBatch,
  type BatchDownloadRequest,
  type DownloadRequest,
  type GameTransfer,
} from "@/lib/games/transfers";
import { useGameTorrents } from "./use-game-torrents";
import type { NewBatch, NewTransfer, TransferRelink } from "@/lib/generated/games-requests-ipc";
import { useGameDownloadDestination } from "./use-game-download-destination";
import {
  forgetDownloadContext,
  mergeDownloadContext,
  refreshDownloadContexts,
  rememberBatchDownloadContexts,
  rememberDownloadContext,
} from "@/lib/games/download-context";

const loadOpener = () => import("@tauri-apps/plugin-opener");

function newerTransfer(event: GameTransfer | undefined, updated: GameTransfer) {
  return event?.url === updated.url && event.updatedAt >= updated.updatedAt ? event : updated;
}

export function useGameTransfers(profile: string, active: boolean) {
  const torrents = useGameTorrents(profile, active);
  const destinationPicker = useGameDownloadDestination(profile, active);
  const available = isTauri() && ["windows", "linux", "macos"].includes(osClass());
  const [state, setState] = useState<{ profile: string; records: GameTransfer[] }>({
    profile,
    records: [],
  });
  const records = state.profile === profile ? state.records : [];
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const alive = useRef(true),
    owner = useRef(profile),
    pending = useRef(new Set<string>()),
    events = useRef(new Map<string, GameTransfer>()),
    refreshId = useRef(0);
  useLayoutEffect(() => {
    owner.current = profile;
  }, [profile]);
  const valid = () => alive.current && owner.current === profile;
  const refresh = async () => {
    if (!available) return;
    setLoading(true);
    setError("");
    await readRecords();
  };
  const readRecords = async () => {
    refreshDownloadContexts();
    const request = ++refreshId.current;
    events.current.clear();
    const latest = () => valid() && request === refreshId.current;
    await invoke<GameTransfer[]>("games_list_transfers", { profile })
      .then((list) => {
        if (latest())
          setState({
            profile,
            records: [
              ...new Map(
                [...list, ...events.current.values()]
                  .filter((item) => item.profile === profile)
                  .map((item) => [item.id, mergeDownloadContext("http", item)]),
              ).values(),
            ],
          });
      })
      .catch((error: unknown) => {
        if (latest()) setError(transferError(error));
      })
      .finally(() => {
        if (latest()) setLoading(false);
      });
  };
  const release = (id: string) => () => {
    if (valid()) {
      pending.current.delete(id);
      setBusy([...pending.current]);
    }
  };
  const failed = (error: unknown) => {
    if (valid()) setError(transferError(error));
    return false;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [prevProfile, setPrevProfile] = useState(profile);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setBusy([]);
    setError("");
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
    const stop = listen<GameTransfer>("games:transfer", (event) => {
      if (!current || !valid() || event.payload.profile !== profile) return;
      const item = mergeDownloadContext("http", event.payload);
      events.current.set(event.payload.id, event.payload);
      setState((previous) => ({
        profile,
        records: [
          ...(previous.profile === profile ? previous.records : []).filter((r) => r.id !== item.id),
          item,
        ],
      }));
    }).catch(() => () => {});
    const stopQueue = listen<string>("games:download-queue", (event) => {
      if (current && valid() && event.payload === profile) void refresh();
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
  const start = async (request: DownloadRequest, suggestedFilename?: string) => {
    if (!available || pending.current.has("new")) return false;
    pending.current.add("new");
    setBusy([...pending.current]);
    setError("");
    return destinationPicker
      .choose(
        {
          name: request.name || downloadFilename(request.url),
          filename: suggestedFilename?.trim()
            ? downloadName(suggestedFilename)
            : request.name?.trim()
              ? downloadName(request.name)
              : downloadFilename(request.url),
          expectedBytes: request.expectedBytes,
        },
        async (selection) => {
          if (!valid()) return false;
          const record = await invoke<GameTransfer>("games_add_transfer", {
            args: {
              ...request,
              game: downloadGame(request.game),
              profile,
              name: request.name?.trim() || downloadFilename(request.url),
              destination: selection.path,
            } satisfies NewTransfer,
            preparation: selection.preparation,
          });
          if (record.profile !== profile) return false;
          rememberDownloadContext(profile, "http", record.id, request.game);
          if (valid())
            setState((previous) => ({
              profile,
              records: [
                ...(previous.profile === profile ? previous.records : []).filter(
                  (item) => item.id !== record.id,
                ),
                mergeDownloadContext("http", events.current.get(record.id) ?? record),
              ],
            }));
          return true;
        },
      )
      .catch(failed)
      .finally(release("new"));
  };
  const startBatch = async (requests: BatchDownloadRequest[]) => {
    if (!available || pending.current.has("new")) return false;
    pending.current.add("new");
    setBusy([...pending.current]);
    setError("");
    return attempt(() => {
      validateDownloadBatch(requests);
      return destinationPicker.choose(
        {
          name: requests[0]?.game?.name || requests[0]?.name || requests[0].filename,
          filenames: requests.map((request) => request.filename),
          expectedBytes: requests.every((item) => item.expectedBytes != null)
            ? requests.reduce((sum, item) => sum + item.expectedBytes!, 0)
            : undefined,
        },
        async (selection) => {
          if (!valid()) return false;
          const added = await invoke<GameTransfer[]>("games_add_transfer_batch", {
            args: {
              profile,
              directory: selection.path,
              files: requests.map((request) => ({
                ...request,
                game: downloadGame(request.game),
                name: request.name?.trim() || request.filename,
              })),
            } satisfies NewBatch,
            preparation: selection.preparation,
          });
          rememberBatchDownloadContexts(profile, requests, added);
          if (valid())
            setState((previous) => ({
              profile,
              records: [
                ...new Map(
                  [
                    ...(previous.profile === profile ? previous.records : []),
                    ...added
                      .filter((record) => record.profile === profile)
                      .map((record) =>
                        mergeDownloadContext("http", events.current.get(record.id) ?? record),
                      ),
                  ].map((record) => [record.id, record]),
                ).values(),
              ],
            }));
          return true;
        },
      );
    })
      .catch(failed)
      .finally(release("new"));
  };
  const action = async (
    id: string,
    action: "pause" | "resume" | "cancel" | "remove" | "earlier" | "later",
  ) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setBusy([...pending.current]);
    setError("");
    await invoke("games_transfer_action", { profile, id, action })
      .then(async () => {
        if (action === "remove") forgetDownloadContext(profile, "http", id);
        if (valid()) {
          if (action === "remove") {
            events.current.delete(id);
            setState((previous) => ({
              ...previous,
              records: previous.records.filter((item) => item.id !== id),
            }));
          } else await refresh();
        }
      })
      .catch(failed)
      .finally(release(id));
  };
  const reveal = (record: GameTransfer) =>
    loadOpener()
      .then(({ revealItemInDir }) => revealItemInDir(record.destination))
      .catch(failed)
      .then(() => {});
  const relink = async (record: GameTransfer, file: ReplacementFile) => {
    if (!available || !valid() || record.profile !== profile || pending.current.has(record.id))
      throw Error("transfer_state");
    pending.current.add(record.id);
    setBusy([...pending.current]);
    setError("");
    await invoke<GameTransfer>("games_relink_transfer", {
      args: {
        profile,
        id: record.id,
        previousUrl: record.url,
        url: file.url,
        filename: file.filename,
        sourceLink: file.sourceLink,
        browserTicket: file.browserTicket,
        expectedBytes: file.expectedBytes,
        expectedSha256: file.expectedSha256,
      } satisfies TransferRelink,
    })
      .then((updated) => {
        if (updated.profile !== profile || updated.id !== record.id) throw Error("transfer_state");
        const current = newerTransfer(events.current.get(record.id), updated);
        if (valid())
          setState((previous) => ({
            profile,
            records: [
              ...(previous.profile === profile ? previous.records : []).filter(
                (item) => item.id !== record.id,
              ),
              mergeDownloadContext("http", current),
            ],
          }));
      })
      .finally(release(record.id));
  };
  return {
    profile,
    torrents,
    available,
    records,
    loading,
    error,
    busy,
    refresh,
    start,
    startBatch,
    action,
    reveal,
    relink,
    destinationPrompt: destinationPicker.prompt,
    dismissError: () => setError(""),
  };
}
export type GameTransfers = ReturnType<typeof useGameTransfers> & { selectionOnly?: boolean };
