import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus } from "@/components/icons/music-icons";
import { MusicActionGlyph, useMusicActionReceipt } from "./music-action-feedback";
import { useT } from "@/lib/i18n";
import { connectSource } from "@/lib/music/catalog";
import {
  addTrackToSpotifyPlaylist,
  createSpotifyPlaylist,
  loadSpotifyLibraryPage,
  spotifyLibraryErrorKey,
  spotifyTrackUri,
  type SpotifyLibraryPage,
} from "@/lib/music/spotify-library";
import type { MusicTrack } from "@/lib/music/types";
import { useMusicConnections } from "./music-connections";
import { matchesPlaylistSearch } from "./music-playlist-search";
import "./music-spotify-library.css";

export function MusicSpotifyDestination({
  track,
  query = "",
  onDone,
  onSetup,
}: {
  track: MusicTrack;
  query?: string;
  onDone: () => void;
  onSetup: () => void;
}) {
  const t = useT();
  const connections = useMusicConnections();
  const account = connections.connections.find((connection) => connection.id === "spotify");
  const connected = account?.status === "connected";
  const uri = spotifyTrackUri(track);
  const destKey = `${connected}:${account?.account ?? ""}:${uri ?? ""}`;
  const [pageState, setPageState] = useState<{ key: string; page: SpotifyLibraryPage } | null>(
    null,
  );
  const [errorState, setErrorState] = useState<{ key: string; code: string } | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [activeDestKey, setActiveDestKey] = useState(destKey);
  if (activeDestKey !== destKey) {
    setActiveDestKey(destKey);
    setSaved("");
    setBusy(false);
    setTarget(null);
    setManualLoading(false);
  }
  const page = pageState?.key === destKey ? pageState.page : null;
  const error = errorState?.key === destKey ? errorState.code : "";
  const initialLoading = Boolean(connected && uri && !page && !error);
  const autoLoading = Boolean(
    query.trim() &&
    !manualLoading &&
    !busy &&
    !saved &&
    !error &&
    connected &&
    uri &&
    page?.nextOffset != null,
  );
  const loading = initialLoading || manualLoading || autoLoading;
  const created = useMusicActionReceipt(`${account?.account}:${uri}`);
  const [name, setName] = useState("");
  const generation = useRef(0);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (offset = 0) => {
    const run = ++generation.current;
    setManualLoading(true);
    setErrorState(null);
    return loadSpotifyLibraryPage("playlists", offset)
      .then((next) => {
        if (
          next.nextOffset != null &&
          (!Number.isSafeInteger(next.nextOffset) ||
            next.nextOffset <= offset ||
            next.nextOffset > 100_000)
        )
          return Promise.reject(new Error("Invalid playlist pagination"));
        if (generation.current === run)
          setPageState((previous) => ({
            key: destKey,
            page:
              offset && previous?.key === destKey
                ? {
                    ...next,
                    playlists: [
                      ...new Map(
                        [...previous.page.playlists, ...next.playlists].map((playlist) => [
                          playlist.id,
                          playlist,
                        ]),
                      ).values(),
                    ],
                  }
                : next,
          }));
      })
      .catch((cause: unknown) => {
        if (generation.current === run)
          setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) });
      })
      .finally(() => {
        if (generation.current === run) setManualLoading(false);
      });
  };

  useEffect(() => {
    if (connected && uri) {
      const run = ++generation.current;
      void loadSpotifyLibraryPage("playlists", 0)
        .then((next) => {
          if (
            next.nextOffset != null &&
            (!Number.isSafeInteger(next.nextOffset) ||
              next.nextOffset <= 0 ||
              next.nextOffset > 100_000)
          )
            return Promise.reject(new Error("Invalid playlist pagination"));
          if (generation.current === run) setPageState({ key: destKey, page: next });
        })
        .catch((cause: unknown) => {
          if (generation.current === run)
            setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) });
        });
    }
    return () => {
      generation.current += 1;
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, [destKey, connected, uri]);

  useEffect(() => {
    const nextOffset = page?.nextOffset;
    if (!autoLoading || nextOffset == null) return;
    const run = ++generation.current;
    void loadSpotifyLibraryPage("playlists", nextOffset)
      .then((next) => {
        if (
          next.nextOffset != null &&
          (!Number.isSafeInteger(next.nextOffset) ||
            next.nextOffset <= nextOffset ||
            next.nextOffset > 100_000)
        )
          return Promise.reject(new Error("Invalid playlist pagination"));
        if (generation.current === run)
          setPageState((previous) => ({
            key: destKey,
            page:
              previous?.key === destKey
                ? {
                    ...next,
                    playlists: [
                      ...new Map(
                        [...previous.page.playlists, ...next.playlists].map((playlist) => [
                          playlist.id,
                          playlist,
                        ]),
                      ).values(),
                    ],
                  }
                : next,
          }));
      })
      .catch((cause: unknown) => {
        if (generation.current === run)
          setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) });
      });
  }, [autoLoading, page?.nextOffset, destKey]);

  const add = async (playlistId: string) => {
    if (busy || saved) return;
    const run = generation.current;
    setBusy(true);
    setTarget(playlistId);
    setErrorState(null);
    return addTrackToSpotifyPlaylist(playlistId, track)
      .then(() => {
        if (generation.current !== run) return;
        setSaved(playlistId);
        finishTimer.current = setTimeout(onDone, 600);
      })
      .catch((cause: unknown) => {
        if (generation.current === run)
          setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) });
      })
      .finally(() => {
        if (generation.current === run) setBusy(false);
      });
  };

  const create = async () => {
    if (!name.trim() || busy || saved) return;
    const run = generation.current;
    setBusy(true);
    setTarget(null);
    setErrorState(null);
    return createSpotifyPlaylist(name)
      .then((playlist) => {
        if (generation.current !== run) return;
        created.confirm();
        setName("");
        setNotice(t("music.spotifyLibrary.created", { name: playlist.name }));
        setPageState((previous) =>
          previous?.key === destKey
            ? {
                key: destKey,
                page: {
                  ...previous.page,
                  playlists: [playlist, ...previous.page.playlists],
                  total: previous.page.total == null ? null : previous.page.total + 1,
                },
              }
            : previous,
        );
        window.dispatchEvent(new Event("harbor:spotify-library-changed"));
      })
      .catch((cause: unknown) => {
        if (generation.current === run)
          setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) });
      })
      .finally(() => {
        if (generation.current === run) setBusy(false);
      });
  };

  const reconnect = async () => {
    setBusy(true);
    setTarget("reconnect");
    setErrorState(null);
    return connectSource("spotify")
      .then((next) => {
        connections.apply(next);
        return load();
      })
      .catch((cause: unknown) =>
        setErrorState({ key: destKey, code: spotifyLibraryErrorKey(cause) }),
      )
      .finally(() => setBusy(false));
  };

  if (!connected)
    return (
      <button type="button" className="music-spotify-button" onClick={onSetup}>
        {t("music.spotifyLibrary.connect")}
      </button>
    );
  if (!uri)
    return <p className="text-sm text-ink-muted">{t("music.spotifyLibrary.spotifyTrackOnly")}</p>;
  return (
    <div className="music-spotify-destination flex min-w-0 flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(error)}
        </p>
      )}
      {((page && !page.canCreate) ||
        error === "music.spotifyLibrary.permission" ||
        error === "music.spotifyLibrary.reconnectNeeded") && (
        <div className="music-spotify-permission">
          <p>{t("music.spotifyLibrary.permission")}</p>
          <button
            type="button"
            className="music-spotify-button"
            disabled={busy}
            onClick={() => void reconnect()}
          >
            {t("music.spotifyLibrary.reconnect")}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      )}
      <span role="status" className="sr-only">
        {saved ? t("music.similar.saved") : ""}
      </span>
      <ul className="music-playlist-destination-list">
        {page?.playlists
          .filter((playlist) => matchesPlaylistSearch(playlist.name, query))
          .map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                disabled={busy || !!saved || !playlist.editable}
                aria-busy={busy && target === playlist.id}
                data-music-action-state={
                  saved === playlist.id ? "done" : busy && target === playlist.id ? "busy" : "idle"
                }
                onClick={() => void add(playlist.id)}
                className="music-action-button flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm text-ink hover:bg-raised disabled:opacity-40"
              >
                <span className="truncate">{playlist.name}</span>
                <MusicActionGlyph
                  state={
                    saved === playlist.id
                      ? "done"
                      : busy && target === playlist.id
                        ? "busy"
                        : "idle"
                  }
                  idle={null}
                  size={17}
                  identity={uri ?? undefined}
                />
              </button>
            </li>
          ))}
      </ul>
      {!loading &&
        !error &&
        page &&
        page.nextOffset == null &&
        !page.playlists.some((playlist) => matchesPlaylistSearch(playlist.name, query)) && (
          <p role="status" className="text-sm text-ink-muted">
            {t(query.trim() ? "music.playlist.noMatches" : "music.playlist.none")}
          </p>
        )}
      {loading && (
        <p role="status" className="music-spotify-actions text-sm text-ink-muted">
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          {t("music.loading")}
        </p>
      )}
      {error && !page && (
        <button
          type="button"
          className="music-spotify-button"
          disabled={loading}
          onClick={() => void load()}
        >
          {t("common.retry")}
        </button>
      )}
      {page?.nextOffset != null && (
        <button
          type="button"
          className="music-spotify-button"
          disabled={loading || busy}
          onClick={() => void load(page.nextOffset!)}
        >
          {t("music.library.loadMore")}
        </button>
      )}
      {page?.canCreate && (
        <form
          className="music-spotify-create border-t border-edge-soft pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p>{t("music.spotifyLibrary.createThenAdd")}</p>
          <input
            value={name}
            maxLength={100}
            disabled={busy || !!saved}
            onChange={(event) => setName(event.target.value)}
            aria-label={t("music.playlist.nameLabel")}
            placeholder={t("music.playlist.namePlaceholder")}
          />
          <button
            type="submit"
            className="music-spotify-button music-action-button"
            disabled={busy || !!saved || !name.trim()}
            aria-busy={busy && target === null}
            data-music-action-state={
              busy && target === null ? "busy" : created.confirmed ? "done" : "idle"
            }
          >
            <MusicActionGlyph
              state={busy && target === null ? "busy" : created.confirmed ? "done" : "idle"}
              idle={<Plus size={17} />}
              size={17}
            />
            {t("music.spotifyLibrary.create")}
          </button>
        </form>
      )}
    </div>
  );
}
