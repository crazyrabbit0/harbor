import { useEffect, useState } from "react";
import { Check, LoaderCircle, RotateCcw, Speaker } from "@/components/icons/music-icons";
import { useT } from "@/lib/i18n";
import {
  selectableSpotifyDevices,
  setSpotifyPlaybackTarget,
  spotifyDevices,
  spotifyPlaybackTarget,
  type SpotifyDevice,
} from "@/lib/music/spotify-devices";

const CHOICE =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start transition-colors hover:bg-elevated";
const EMPTY_DEVICES: SpotifyDevice[] = [];

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function SpotifyPlaybackTarget() {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    attempt: number;
    devices: SpotifyDevice[];
    error: string;
  } | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([spotifyDevices(), spotifyPlaybackTarget()])
      .then(([found, chosen]) => {
        if (cancelled) return;
        setSnapshot({ attempt, devices: selectableSpotifyDevices(found), error: "" });
        setTarget(chosen);
      })
      .catch((cause) => {
        if (cancelled) return;
        setSnapshot((prev) => ({
          attempt,
          devices: prev?.devices ?? EMPTY_DEVICES,
          error: describe(cause),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const loading = snapshot?.attempt !== attempt;
  const devices = snapshot?.devices ?? EMPTY_DEVICES;
  const error = snapshot?.attempt === attempt ? snapshot.error : "";
  const load = () => setAttempt((value) => value + 1);

  const choose = (device: string | null) => {
    const previous = target;
    setTarget(device);
    setSnapshot((prev) => (prev ? { ...prev, error: "" } : prev));
    void setSpotifyPlaybackTarget(device).catch((cause) => {
      setTarget(previous);
      setSnapshot((prev) => ({
        attempt,
        devices: prev?.devices ?? EMPTY_DEVICES,
        error: describe(cause),
      }));
    });
  };

  return (
    <section className="border-t border-edge-soft bg-elevated/25 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-6 text-ink">
            {t("music.spotifyDevices.title")}
          </p>
          <p className="text-[13px] leading-5 text-ink-muted">{t("music.spotifyDevices.body")}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-edge px-4 text-[12px] font-medium text-ink hover:bg-elevated disabled:opacity-40"
        >
          {loading ? (
            <LoaderCircle
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <RotateCcw size={16} aria-hidden="true" />
          )}
          {t("music.spotifyDevices.refresh")}
        </button>
      </div>
      <ul className="mt-3 grid gap-0.5">
        <li>
          <button
            type="button"
            className={CHOICE}
            aria-pressed={target === null}
            onClick={() => choose(null)}
          >
            <Speaker size={17} aria-hidden="true" className="shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {t("music.spotifyDevices.harbor")}
            </span>
            {target === null && (
              <Check size={17} aria-hidden="true" className="shrink-0 text-ink" />
            )}
          </button>
        </li>
        {devices.map((device) => (
          <li key={device.id}>
            <button
              type="button"
              className={CHOICE}
              aria-pressed={target === device.id}
              onClick={() => choose(device.id)}
            >
              <Speaker size={17} aria-hidden="true" className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={device.name}>
                {device.name}
              </span>
              <span className="shrink-0 text-[11px] text-ink-muted">{device.kind}</span>
              {target === device.id && (
                <Check size={17} aria-hidden="true" className="shrink-0 text-ink" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {!loading && devices.length === 0 && (
        <p className="mt-2 text-[13px] leading-5 text-ink-subtle">
          {t("music.spotifyDevices.empty")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-5 text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
