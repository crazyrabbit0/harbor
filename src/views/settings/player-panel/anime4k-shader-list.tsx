import { AlertTriangle, Check, Download, Loader2, RefreshCw } from "../icons";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { tvFocus } from "@/lib/keyboard-navigation";
import { navOwnsFocus } from "@/lib/keyboard-navigation/geometry";
import { anime4kDir, downloadAnime4k } from "@/lib/anime4k";
import { BeforeAfter } from "../shaders-panel/before-after";
import {
  anime4kChain,
  ANIME4K_MODES,
  type Anime4kMode,
  type Anime4kTier,
} from "@/lib/player/anime4k-modes";
import { useSettings } from "@/lib/settings";
import { ROW_ACTION, ROW_ACTION_PRIMARY, ROW_DESC, SettingGroup } from "../kit";
import { Segmented } from "../shared";
import { ChoiceBlock } from "./choice";

export function Anime4kShaderList() {
  const { settings, update } = useSettings();
  const t = useT();
  const folder = settings.playerAnime4kFolder;
  const mode = (settings.playerAnime4kMode as Anime4kMode) || "A";
  const tier = (settings.playerAnime4kTier as Anime4kTier) || "hq";
  const [busy, setBusy] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setupRef = useRef<HTMLButtonElement>(null);
  const tierRef = useRef<HTMLDivElement>(null);
  const handOff = useRef(false);

  // The folder lookup runs once with the choices known at mount.
  const [mount] = useState(() => ({ folder, mode, tier }));
  const updateRef = useRef(update);
  useLayoutEffect(() => {
    updateRef.current = update;
  }, [update]);
  useEffect(() => {
    if (mount.folder) return;
    let cancelled = false;
    anime4kDir()
      .then((dir) => {
        if (cancelled || !dir) return;
        updateRef.current({
          playerAnime4kFolder: dir,
          playerAnime4kShaders: anime4kChain(dir, mount.mode, mount.tier),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mount]);

  useEffect(() => {
    if (!folder || !handOff.current) return;
    handOff.current = false;
    const el = tierRef.current?.querySelector("button");
    if (el) tvFocus(el);
  }, [folder]);

  const setup = async (force = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setJustUpdated(false);
    await downloadAnime4k(force)
      .then((dir) => {
        const active = document.activeElement;
        handOff.current =
          !folder &&
          active instanceof HTMLElement &&
          active === setupRef.current &&
          navOwnsFocus(active);
        update({ playerAnime4kFolder: dir, playerAnime4kShaders: anime4kChain(dir, mode, tier) });
        if (force) {
          setJustUpdated(true);
          window.setTimeout(() => setJustUpdated(false), 2200);
        }
      })
      .catch((e: unknown) =>
        setError(
          typeof e === "string" ? e : t("Download failed. Check your connection and try again."),
        ),
      )
      .finally(() => setBusy(false));
  };

  const pickMode = (m: Anime4kMode) =>
    update({ playerAnime4kMode: m, playerAnime4kShaders: anime4kChain(folder, m, tier) });
  const pickTier = (nextTier: Anime4kTier) =>
    update({
      playerAnime4kTier: nextTier,
      playerAnime4kShaders: anime4kChain(folder, mode, nextTier),
    });

  return (
    <SettingGroup label={t("Anime4K presets")}>
      <p className={`max-w-[70ch] ${ROW_DESC}`}>
        {t(
          "GPU shaders that sharpen lines and clean up gradients on anime as it plays. Pick a mode, Harbor handles the shaders.",
        )}
      </p>

      <BeforeAfter
        demo={{
          before: "/shader-demos/anime4k/before.webp",
          after: "/shader-demos/anime4k/after.webp",
          credit: t("Harbor, from a public domain frame"),
        }}
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-elevated px-4 py-3">
          <AlertTriangle size={18} strokeWidth={2.2} className="mt-[2px] shrink-0 text-danger" />
          <p className="max-w-[66ch] text-[15.5px] leading-[22px] text-danger">{error}</p>
        </div>
      )}

      {!folder ? (
        <div className="flex flex-col gap-3">
          <p className={`max-w-[70ch] ${ROW_DESC}`}>
            {t(
              "One-time setup downloads the shader pack (about 1 MB) into Harbor. No files to hunt down.",
            )}
          </p>
          <button
            ref={setupRef}
            type="button"
            onClick={busy ? undefined : () => setup(false)}
            aria-disabled={busy}
            className={`${ROW_ACTION_PRIMARY} w-fit${busy ? " pointer-events-none opacity-40" : ""}`}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} strokeWidth={2.2} />
            )}
            {busy ? t("Downloading shaders…") : t("Set up Anime4K")}
          </button>
        </div>
      ) : (
        <>
          <div ref={tierRef}>
            <Segmented<Anime4kTier>
              value={tier}
              options={[
                { value: "hq", label: t("Quality") },
                { value: "fast", label: t("Performance") },
              ]}
              onChange={pickTier}
            />
          </div>

          {ANIME4K_MODES.map((m) => (
            <ChoiceBlock
              key={m.id}
              selected={mode === m.id}
              onClick={() => pickMode(m.id)}
              label={t(m.label)}
              sub={t(m.sub)}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[15.5px] leading-[22px] text-ink-muted">
              <Check size={17} className="text-success" strokeWidth={2.6} />
              {t("Shaders installed")}
            </span>
            <button
              type="button"
              onClick={busy ? undefined : () => setup(true)}
              aria-disabled={busy}
              className={`${ROW_ACTION} ${justUpdated ? "text-success" : ""}${
                busy ? " pointer-events-none opacity-45" : ""
              }`}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" strokeWidth={2.6} />
                  {t("Updating…")}
                </>
              ) : justUpdated ? (
                <>
                  <Check size={16} strokeWidth={3} />
                  {t("Updated")}
                </>
              ) : (
                <>
                  <RefreshCw size={16} strokeWidth={2.4} />
                  {t("Re-download")}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </SettingGroup>
  );
}
