import { Check, Minus, Plus, Settings2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import type { HotkeyId } from "@/lib/hotkeys";
import { usePlayerChromeHold } from "@/lib/player/chrome-hold";
import { SEEK_STEP_OPTIONS, nudgeStep, sanitizeSeekStep } from "@/lib/seek-step";
import { useSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings/types";
import { DEFAULT } from "@/lib/settings/defaults";
import { KeyChips } from "./hotkey-label";
import { Tooltip } from "./tooltip";

type SeekAction = { key: string; label: string; hotkey: HotkeyId; run: () => void };
type StepSetting = Extract<
  keyof Settings,
  | "seekBackStepSec"
  | "seekForwardStepSec"
  | "seekBackStepShortSec"
  | "seekForwardStepShortSec"
  | "seekBackStepLongSec"
  | "seekForwardStepLongSec"
>;

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas/60 text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function SeekStepBtn({
  direction,
  onSeekStep,
  onFrameStep,
}: {
  direction: "back" | "forward";
  onSeekStep: (delta: number) => void;
  onFrameStep?: (dir: 1 | -1) => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const back = direction === "back";
  const sign = back ? -1 : 1;
  const seconds = back
    ? sanitizeSeekStep(settings.seekBackStepSec, DEFAULT.seekBackStepSec)
    : sanitizeSeekStep(settings.seekForwardStepSec, DEFAULT.seekForwardStepSec);
  const shortSeconds = back
    ? sanitizeSeekStep(settings.seekBackStepShortSec, DEFAULT.seekBackStepShortSec)
    : sanitizeSeekStep(settings.seekForwardStepShortSec, DEFAULT.seekForwardStepShortSec);
  const longSeconds = back
    ? sanitizeSeekStep(settings.seekBackStepLongSec, DEFAULT.seekBackStepLongSec)
    : sanitizeSeekStep(settings.seekForwardStepLongSec, DEFAULT.seekForwardStepLongSec);
  const stepHotkey: HotkeyId = back ? "playerSeekBack10" : "playerSeekForward10";
  const numberedSrc = `/player-icons/seek-${direction}-${seconds}.png`;
  const [numberedOk, setNumberedOk] = useState(true);
  useEffect(() => setNumberedOk(true), [numberedSrc]);
  const [pickerOpen, setPickerOpen] = useState(false);
  usePlayerChromeHold(pickerOpen);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!pickerOpen) setEditing(false);
  }, [pickerOpen]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const claimedRef = useRef(false);
  const iconRef = useRef<HTMLImageElement>(null);

  const playNudge = () => {
    const el = iconRef.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: `rotate(${back ? -40 : 40}deg)`, offset: 0.4 },
        { transform: "rotate(0deg)" },
      ],
      { duration: 460, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    // Capture and stop Escape so closing the menu never also reaches the player's close key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pickerOpen]);

  const cancelTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (pickerOpen) return;
    claimedRef.current = false;
    cancelTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      claimedRef.current = true;
      setPickerOpen(true);
    }, 380);
  };

  const onPointerUp = () => {
    if (claimedRef.current) {
      claimedRef.current = false;
      return;
    }
    if (holdTimerRef.current != null) {
      cancelTimer();
      onSeekStep(sign * seconds);
      playNudge();
    }
  };

  // The button itself is the normal step, so the menu only offers the other ways to move.
  const actions: SeekAction[] = [];
  if (onFrameStep) {
    actions.push({
      key: "frame",
      label: back ? t("Previous frame") : t("Next frame"),
      hotkey: back ? "playerFrameBack" : "playerFrameForward",
      run: () => onFrameStep(back ? -1 : 1),
    });
  }
  actions.push(
    {
      key: "short",
      label: t("{n} seconds", { n: shortSeconds }),
      hotkey: back ? "playerSeekBackShort" : "playerSeekForwardShort",
      run: () => onSeekStep(sign * shortSeconds),
    },
    {
      key: "long",
      label: t("{n} seconds", { n: longSeconds }),
      hotkey: back ? "playerSeekBack30" : "playerSeekForward30",
      run: () => onSeekStep(sign * longSeconds),
    },
  );

  const steps: { key: string; label: string; value: number; setting: StepSetting }[] = [
    {
      key: "normal",
      label: t("Seek step"),
      value: seconds,
      setting: back ? "seekBackStepSec" : "seekForwardStepSec",
    },
    {
      key: "short",
      label: t("Short seek"),
      value: shortSeconds,
      setting: back ? "seekBackStepShortSec" : "seekForwardStepShortSec",
    },
    {
      key: "long",
      label: t("Long seek"),
      value: longSeconds,
      setting: back ? "seekBackStepLongSec" : "seekForwardStepLongSec",
    },
  ];

  const word = back ? t("Back") : t("Forward");
  return (
    <div ref={wrapRef} className="relative">
      <Tooltip
        label={
          <span className="inline-flex flex-col items-center gap-1">
            <span className="inline-flex items-center gap-2">
              <span>{t("{word} {n} seconds", { word, n: seconds })}</span>
              <KeyChips ids={[stepHotkey]} tone="tip" />
            </span>
            <span className="text-white/60">{t("Right-click or hold for more options")}</span>
          </span>
        }
        hidden={pickerOpen}
      >
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={cancelTimer}
          onPointerCancel={cancelTimer}
          onContextMenu={(e) => {
            e.preventDefault();
            setPickerOpen(true);
          }}
          aria-label={t("{word} {n} seconds. Right-click or hold for more options", {
            word,
            n: seconds,
          })}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100 ${
            pickerOpen
              ? "bg-white/15 text-white"
              : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          {numberedOk ? (
            <img
              ref={iconRef}
              src={numberedSrc}
              width={30}
              height={30}
              alt=""
              draggable={false}
              className="select-none"
              onError={() => setNumberedOk(false)}
            />
          ) : (
            <>
              <img
                src={`/player-icons/seek-${direction}.svg`}
                width={34}
                height={34}
                alt=""
                draggable={false}
                className="select-none"
              />
              <span className="absolute font-mono text-[10px] font-bold tabular-nums leading-none">
                {seconds}
              </span>
            </>
          )}
        </button>
      </Tooltip>
      {pickerOpen && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-56 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-md bg-elevated p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] animate-menu-pop"
        >
          <div className="flex items-center justify-between gap-2 ps-2.5 pe-1 pb-1 pt-0.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
              {word}
            </span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              aria-label={editing ? t("Done") : t("Change seek steps")}
              title={editing ? t("Done") : t("Change seek steps")}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                editing
                  ? "bg-accent/20 text-accent"
                  : "text-ink-subtle hover:bg-canvas/60 hover:text-ink"
              }`}
            >
              {editing ? (
                <Check size={15} strokeWidth={2.4} />
              ) : (
                <Settings2 size={15} strokeWidth={2.2} />
              )}
            </button>
          </div>
          {editing &&
            steps.map((s) => (
              <div
                key={s.key}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <StepButton
                  label={t("Shorter")}
                  disabled={s.value <= SEEK_STEP_OPTIONS[0]}
                  onClick={() => update({ [s.setting]: nudgeStep(s.value, -1) })}
                >
                  <Minus size={14} strokeWidth={2.4} />
                </StepButton>
                <span className="w-9 text-center tabular-nums">{t("{n}s", { n: s.value })}</span>
                <StepButton
                  label={t("Longer")}
                  disabled={s.value >= SEEK_STEP_OPTIONS[SEEK_STEP_OPTIONS.length - 1]}
                  onClick={() => update({ [s.setting]: nudgeStep(s.value, 1) })}
                >
                  <Plus size={14} strokeWidth={2.4} />
                </StepButton>
              </div>
            ))}
          {!editing &&
            actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  a.run();
                  playNudge();
                  setPickerOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink transition-colors hover:bg-canvas/60"
              >
                <span className="min-w-0 flex-1 truncate tabular-nums">{a.label}</span>
                <KeyChips ids={[a.hotkey]} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
