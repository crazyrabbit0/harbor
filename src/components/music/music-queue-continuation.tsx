import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dropdown } from "@/components/dropdown";
import { HoverTooltip } from "@/components/hover-tooltip";
import { LoaderCircle, Plus } from "@/components/icons/music-icons";
import { useT } from "@/lib/i18n";
import { getMusicState, setMusicQueue } from "@/lib/music/player";
import {
  getMusicPlaybackOrigin,
  getMusicQueueRevision,
  setMusicPlaybackOrigin,
  useMusicPlaybackOrigin,
} from "@/lib/music/playback-origin";
import {
  freshContinuationTracks,
  loadMusicContinuation,
  type MusicContinuationMode,
} from "@/lib/music/queue-continuation";
import { readMusicPreference, writeMusicPreference } from "@/lib/music/preferences";
import { filterBlockedTracks } from "@/lib/music/artist-blocks";
import { musicSourceName } from "@/lib/music/recovery";

const MODE_KEY = "harbor.music.queue-continuation.v1";

export function MusicQueueContinuation({
  remaining,
  children,
}: {
  remaining: number;
  children?: ReactNode;
}) {
  const t = useT();
  const origin = useMusicPlaybackOrigin();
  const revision = getMusicQueueRevision();
  const [mode, setMode] = useState<MusicContinuationMode>(() =>
    readMusicPreference(MODE_KEY) === "discover" ? "discover" : "context",
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    request.current += 1;
    busy.current = false;
    setLoading(false);
    setNotice("");
    return () => {
      request.current += 1;
      busy.current = false;
    };
  }, [revision, mode]);

  const load = async () => {
    if (busy.current) return;
    const snapshot = getMusicState();
    if (!snapshot.current) return;
    const run = ++request.current;
    const started = getMusicQueueRevision();
    busy.current = true;
    setLoading(true);
    setNotice("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stale = () => run !== request.current || started !== getMusicQueueRevision();
    return Promise.race([
      loadMusicContinuation({
        mode,
        origin: getMusicPlaybackOrigin(),
        current: snapshot.current,
        queue: snapshot.queue,
        history: [...snapshot.recents, ...snapshot.likedTracks],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timeout")), 30_000);
      }),
    ])
      .then((result) => {
        if (stale()) return;
        const latest = getMusicState();
        const playing = latest.current;
        if (!playing) return;
        const excluded = [
          playing,
          ...latest.queue,
          ...(mode === "discover" ? [...latest.recents, ...latest.likedTracks] : []),
        ];
        const allowVideo = playing.mediaKind === "video";
        const first = filterBlockedTracks(
          freshContinuationTracks(result.tracks, excluded, allowVideo),
          "play",
        );
        if (mode === "context") setMusicPlaybackOrigin(result.origin);
        const settled =
          !first.length && mode === "context"
            ? loadMusicContinuation({
                mode: "discover",
                origin: getMusicPlaybackOrigin(),
                current: playing,
                queue: latest.queue,
                history: [...latest.recents, ...latest.likedTracks],
              }).then((wider) =>
                stale()
                  ? null
                  : filterBlockedTracks(
                      freshContinuationTracks(wider.tracks, excluded, allowVideo),
                      "play",
                    ),
              )
            : Promise.resolve(first);
        return settled.then((tracks) => {
          if (tracks === null) return;
          if (tracks.length) setMusicQueue([...latest.queue, ...tracks]);
          setNotice(
            tracks.length
              ? t("music.now.moreAdded", { count: tracks.length })
              : t(
                  mode === "context" && result.exhausted
                    ? "music.now.contextEnd"
                    : "music.now.noNewSongs",
                ),
          );
        });
      })
      .catch(() => {
        if (run === request.current && started === getMusicQueueRevision())
          setNotice(t("music.now.moreError"));
      })
      .finally(() => {
        clearTimeout(timer);
        if (run === request.current) {
          busy.current = false;
          setLoading(false);
        }
      });
  };
  const current = getMusicState().current;
  const context =
    origin?.name ??
    (current
      ? musicSourceName({
          ...current,
          connectorId: current.collectionOrigin?.connectorId ?? current.connectorId,
        })
      : "");
  return (
    <div className="music-now-continuation" aria-busy={loading}>
      <div className="music-now-more-controls">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="music-now-load-more"
        >
          {loading ? (
            <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus size={16} />
          )}
          {t(loading ? "music.loading" : "music.library.loadMore")}
        </button>
        <HoverTooltip
          label={
            mode === "context"
              ? t("music.now.continueFrom", { name: context })
              : t("music.now.discoverHint")
          }
          side="top"
        >
          <Dropdown
            size="sm"
            className="music-now-more-mode"
            value={mode}
            ariaLabel={t("music.now.moreMode")}
            options={[
              { value: "context", label: t("music.now.sameContext") },
              { value: "discover", label: t("music.now.discoverNew") },
            ]}
            onChange={(value) => {
              if (value === mode) return;
              request.current += 1;
              setMode(value as MusicContinuationMode);
              writeMusicPreference(MODE_KEY, value);
            }}
          />
        </HoverTooltip>
      </div>
      {notice && (
        <p className="music-now-more-notice" role="status">
          {notice}
        </p>
      )}
      {children}
      {remaining < 5 && (
        <div
          className="music-now-queue-placeholders"
          data-loading={loading || undefined}
          aria-hidden="true"
        >
          {Array.from({ length: 5 - remaining }, (_, index) => (
            <div className="music-now-queue-placeholder" key={index}>
              <span className="music-now-placeholder-art" />
              <span className="music-now-placeholder-copy">
                <i />
                <i />
              </span>
              <span className="music-now-placeholder-time" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
