import { useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, FolderOpen, HardDrive } from "lucide-react";
import { useT } from "@/lib/i18n";
import { setupPath } from "@/lib/games/setup";
import { setupLocationChoices, type SetupLocations } from "@/lib/games/setup-locations";
import { transferBytes } from "@/lib/games/transfers";

export function SetupSkeleton({ label }: { label: string }) {
  return (
    <div className="games-setup-skeleton" role="status" aria-label={label}>
      <p>{label}</p>
      <div aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <i key={index}>
            <b />
            <span>
              <em />
              <em />
            </span>
            <b />
          </i>
        ))}
      </div>
    </div>
  );
}

export function GameSetupDestination({
  name,
  source,
  recent,
  destination,
  disabled,
  select,
  browse,
}: {
  name: string;
  source: string;
  recent: string;
  destination: string;
  disabled: boolean;
  select: (path: string) => void;
  browse: () => void;
}) {
  const t = useT(),
    labelId = useId();
  const [result, setResult] = useState<{
    recent: string;
    locations: SetupLocations;
    unavailable: boolean;
  } | null>(null);
  const loading = result?.recent !== recent;
  const locations = result?.recent === recent ? result.locations : { drives: [], selected: null };
  const unavailable = result?.recent === recent && result.unavailable;
  useEffect(() => {
    let alive = true;
    void invoke<SetupLocations>("games_download_locations", { parent: recent || null })
      .then((value) => {
        if (alive) setResult({ recent, locations: value, unavailable: false });
      })
      .catch(() => {
        if (alive) {
          setResult({ recent, locations: { drives: [], selected: null }, unavailable: true });
        }
      });
    return () => {
      alive = false;
    };
  }, [recent]);
  const choices = setupLocationChoices(locations, name, source);
  return (
    <section className="games-setup-destination" aria-labelledby={labelId}>
      <div className="games-setup-destination-heading">
        <h3 id={labelId}>{t("games.setup.destination")}</h3>
        <button className="games-button" disabled={disabled} onClick={browse}>
          <FolderOpen size={17} />
          {t("games.torrent.browse")}
        </button>
      </div>
      {loading ? (
        <SetupSkeleton label={t("games.torrent.loadingDrives")} />
      ) : (
        <div className="games-setup-locations" role="group" aria-labelledby={labelId}>
          {choices.map((choice) => (
            <button
              key={choice.path}
              className="games-setup-location"
              aria-pressed={setupPath(destination) === setupPath(choice.destination)}
              disabled={disabled}
              onClick={() => select(choice.destination)}
            >
              {choice.recent ? (
                <FolderOpen size={23} aria-hidden />
              ) : (
                <HardDrive size={23} aria-hidden />
              )}
              <span>
                <strong>{choice.recent ? t("games.setup.recentLocation") : choice.label}</strong>
                <small dir="ltr">{choice.destination.replace(/^\\\\\?\\/, "")}</small>
              </span>
              <span className="games-setup-location-space">
                {choice.availableBytes !== null &&
                  t("games.torrent.free", { size: transferBytes(choice.availableBytes) })}
              </span>
              <i aria-hidden>
                {setupPath(destination) === setupPath(choice.destination) && <Check size={14} />}
              </i>
            </button>
          ))}
        </div>
      )}
      {unavailable && <p role="status">{t("games.torrent.drivesUnavailable")}</p>}
      <div
        className={`games-setup-selected-location ${destination ? "has-selection" : ""}`}
        aria-live="polite"
      >
        <FolderOpen size={18} aria-hidden />
        <span>
          {destination ? (
            <b dir="ltr">{destination.replace(/^\\\\\?\\/, "")}</b>
          ) : (
            t("games.setup.chooseDestination")
          )}
        </span>
      </div>
    </section>
  );
}
export function SetupReadySkeleton() {
  const t = useT();
  return (
    <div
      className="games-setup-ready-skeleton"
      role="status"
      aria-label={t("games.setup.registering")}
    >
      <i />
      <i />
      <i />
      <i />
      <i />
      <div>
        <i />
        <i />
      </div>
    </div>
  );
}
