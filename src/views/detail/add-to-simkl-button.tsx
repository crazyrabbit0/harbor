import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import simklLogo from "@/assets/simkl.png";
import { AnchoredMenu } from "@/components/anchored-menu";
import { HoverTooltip } from "@/components/hover-tooltip";
import { SimklApiError } from "@/lib/simkl/client";
import { resolveSimklTarget } from "@/lib/simkl/ids";
import { useSimkl } from "@/lib/simkl/provider";
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
import type { SimklTarget } from "@/lib/simkl/types";
import { useSettingsSelector } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { SimklRatingPicker } from "./simkl-rating-picker";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function errMsg(t: Translator, e: unknown): string {
  if (e instanceof SimklApiError) {
    return e.status === 401
      ? t("Simkl sign-in expired, reconnect it")
      : t("Simkl error (HTTP {status})", { status: e.status });
  }
  return t("Couldn't reach Simkl");
}

function statusForTarget(
  map: Awaited<ReturnType<typeof loadSimklStatusMap>>,
  harborId: string,
  malKey: string | null,
): WatchlistStatus | null {
  return statusForId(map, harborId) ?? (malKey ? statusForId(map, malKey) : null);
}

export function AddToSimklButton({
  harborId,
  title,
  type,
}: {
  harborId: string;
  title: string;
  type: "movie" | "series";
}) {
  const t = useT();
  const { isConnected } = useSimkl();
  const settings = useSettingsSelector((s) => ({
    simklEnableUserRatings: s.simklEnableUserRatings,
  }));
  const fetchKey = isConnected ? `${harborId}:${type}` : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    target: SimklTarget;
    status: WatchlistStatus | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    void (async () => {
      const tgt = await resolveSimklTarget(harborId, type);
      if (cancelled || !tgt) return;
      const malKey =
        tgt.kind === "movie" || tgt.kind === "show" || tgt.kind === "anime"
          ? tgt.ids.mal != null
            ? `mal:${tgt.ids.mal}`
            : null
          : null;
      try {
        const map = await loadSimklStatusMap();
        if (cancelled) return;
        setLoaded({ key: fetchKey, target: tgt, status: statusForTarget(map, harborId, malKey) });
      } catch {
        if (!cancelled) setLoaded({ key: fetchKey, target: tgt, status: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, harborId, type]);

  const active = fetchKey && loaded?.key === fetchKey ? loaded : null;
  if (!active) return null;

  const { target, status } = active;
  const order = target.kind === "movie" ? MOVIE_STATUS_ORDER : SHOW_STATUS_ORDER;

  const updateStatus = (next: WatchlistStatus | null) =>
    setLoaded((prev) => (prev && prev.key === fetchKey ? { ...prev, status: next } : prev));

  const flash = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const setTo = async (next: WatchlistStatus) => {
    setBusy(true);
    setError(null);
    const prev = status;
    updateStatus(next);
    setMenuOpen(false);
    try {
      const saved = await setSimklStatus(target, next);
      updateStatus(saved);
    } catch (e) {
      updateStatus(prev);
      flash(errMsg(t, e));
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const prev = status;
    updateStatus(null);
    setMenuOpen(false);
    try {
      await clearSimklStatus(target);
    } catch (e) {
      updateStatus(prev);
      flash(errMsg(t, e));
    }
    setBusy(false);
  };

  return (
    <div className="relative shrink-0">
      {status == null ? (
        <HoverTooltip label={t("Add {title} to Simkl", { title })} align="center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void setTo("plantowatch")}
            className="flex h-12 items-center gap-2.5 rounded-full bg-canvas/80 px-6 text-[15px] font-medium text-ink transition-[transform,background-color] duration-200 hover:bg-canvas/95 active:scale-[0.98] disabled:opacity-60"
          >
            <img
              src={simklLogo}
              alt=""
              className="h-[18px] w-[18px] rounded-[4px] object-contain"
            />
            <Plus size={16} strokeWidth={2.2} className="-ms-1" />
            {t("Add to Simkl")}
          </button>
        </HoverTooltip>
      ) : (
        <>
          <button
            ref={btnRef}
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-12 items-center gap-2.5 rounded-full border border-ink bg-ink/10 px-6 text-[15px] font-medium text-ink transition-[transform,background-color,border-color] duration-200 hover:bg-ink/20 active:scale-[0.98] disabled:opacity-60"
          >
            <img
              src={simklLogo}
              alt=""
              className="h-[18px] w-[18px] rounded-[4px] object-contain"
            />
            {t(SIMKL_STATUS_LABELS[status])}
            <ChevronDown
              size={16}
              className={`text-ink-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>
          <AnchoredMenu
            anchorRef={btnRef}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            width={256}
          >
            <div className="overflow-hidden rounded-2xl border border-edge bg-raised py-1.5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)]">
              {order.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void setTo(s)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-[13.5px] transition-colors ${
                    s === status ? "text-ink" : "text-ink-muted hover:bg-elevated/60 hover:text-ink"
                  }`}
                >
                  {t(SIMKL_STATUS_LABELS[s])}
                  {s === status && <Check size={15} className="text-ink" />}
                </button>
              ))}
              {settings.simklEnableUserRatings && (
                <>
                  <div className="my-1 h-px bg-edge-soft" />
                  <div className="px-4 pb-1 pt-1.5">
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                      {t("Your rating")}
                    </div>
                    <SimklRatingPicker
                      harborId={harborId}
                      type={type}
                      simklConnected={isConnected}
                    />
                  </div>
                </>
              )}
              <div className="my-1 h-px bg-edge-soft" />
              <button
                type="button"
                onClick={() => void remove()}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-[13.5px] text-ink-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 size={14} />
                {t("Remove from list")}
              </button>
            </div>
          </AnchoredMenu>
        </>
      )}
      {error && (
        <div className="absolute start-0 top-full z-40 mt-1.5 whitespace-nowrap rounded-lg bg-danger px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {error}
        </div>
      )}
    </div>
  );
}
