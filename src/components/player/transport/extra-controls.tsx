import {
  Activity,
  Captions,
  CaptionsOff,
  ChevronFirst,
  ChevronLast,
  Clapperboard,
  History,
  ImagePlay,
  LayoutTemplate,
  ListOrdered,
  Lock,
  Minus,
  Plus,
  Repeat,
  RotateCw,
  ServerCog,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import type { HotkeyId } from "@/lib/hotkeys";
import type { PlayerControlId } from "@/lib/player-chrome";
import { usePlaybackPositionGated } from "@/lib/player/playback-clock";
import { usePlayerChromeHold } from "@/lib/player/chrome-hold";
import { JUMP_FRAME_BUCKET_SEC, jumpTargets, setJumpMarksPinned } from "@/lib/player/jump-marks";
import { CLIP_LENGTH_OPTIONS, nudgeStep, sanitizeClipLength } from "@/lib/seek-step";
import { onTrickplayPrefetched, thumbCacheGet } from "@/lib/trickplay";
import { useSettingsSelector, useSettingsUpdate } from "@/lib/settings";
import { DEFAULT } from "@/lib/settings/defaults";
import { fmtTime } from "./transport-utils";
import { hotkeyText, KeyChips, withHotkey } from "./hotkey-label";
import type { PlayerExtras } from "./player-extras";
import { Tooltip } from "./tooltip";

export const EXTRA_CONTROL_IDS = [
  "ab-loop",
  "gif-record",
  "clip-record",
  "stats",
  "screen-lock",
  "reload-source",
  "restart-server",
  "prev-channel",
  "jump-start",
  "jump-end",
  "jump-digits",
  "edit-layout",
] as const satisfies readonly PlayerControlId[];

export type ExtraControlId = (typeof EXTRA_CONTROL_IDS)[number];

export function isExtraControl(id: PlayerControlId): id is ExtraControlId {
  return (EXTRA_CONTROL_IDS as readonly PlayerControlId[]).includes(id);
}

export type ExtraButtonStyle = (p: {
  onClick?: () => void;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => ReactNode;

type Ctx = {
  extras?: PlayerExtras;
  durationSec: number;
  isLiveChannel: boolean;
  editing?: boolean;
  tooltipSide?: "top" | "bottom";
  Button: ExtraButtonStyle;
  iconSize: number;
};

/** Renders one of the optional hotkey-action buttons; null when the action can't run here. */
export function ExtraControl({ id, ctx }: { id: ExtraControlId; ctx: Ctx }) {
  const t = useT();
  const x = ctx.extras;
  const { Button, iconSize: s } = ctx;
  const live = ctx.isLiveChannel;
  const vod = !live && ctx.durationSec > 0;
  const btn = (
    label: string,
    hotkeys: HotkeyId[],
    icon: ReactNode,
    onClick: (() => void) | undefined,
    opts: { active?: boolean } = {},
  ) => (
    <Tooltip label={withHotkey(label, ...hotkeys)} side={ctx.tooltipSide}>
      <Button onClick={onClick} ariaLabel={label} active={opts.active} disabled={!onClick}>
        {icon}
      </Button>
    </Tooltip>
  );

  switch (id) {
    case "ab-loop":
      if (live || (!x?.loop && !ctx.editing)) return null;
      return <AbLoopButton ctx={ctx} />;
    case "gif-record": {
      if (live || (!x?.gif && !ctx.editing)) return null;
      const state = x?.gif?.state ?? "idle";
      const label =
        state === "recording"
          ? t("Stop GIF recording")
          : state === "encoding"
            ? t("Saving GIF…")
            : t("Record GIF");
      return btn(
        label,
        ["playerGifRecord"],
        <ImagePlay
          size={s}
          strokeWidth={1.9}
          className={state === "recording" ? "text-red-400" : ""}
        />,
        state === "encoding" ? undefined : x?.gif?.toggle,
        { active: state === "recording" },
      );
    }
    case "clip-record":
      if (live || (!x?.onClip && !ctx.editing)) return null;
      return <ClipButton ctx={ctx} />;
    case "stats":
      return btn(
        x?.stats?.on ? t("Hide stats") : t("Show stats"),
        ["playerStats"],
        <Activity size={s} strokeWidth={1.9} />,
        x?.stats?.toggle,
        { active: x?.stats?.on },
      );
    case "screen-lock":
      if (!x?.screenLock && !ctx.editing) return null;
      return btn(
        t("Lock player controls"),
        ["playerScreenLock"],
        <Lock size={s} strokeWidth={1.9} />,
        x?.screenLock,
      );
    case "reload-source":
      return btn(
        t("Reload source"),
        ["playerReloadSource"],
        <RotateCw size={s} strokeWidth={1.9} />,
        x?.onReloadSource,
      );
    case "restart-server":
      if (!x?.onRestartServer && !ctx.editing) return null;
      return btn(
        t("Restart streaming server"),
        ["playerRestartServer"],
        <ServerCog size={s} strokeWidth={1.9} />,
        x?.onRestartServer,
      );
    case "prev-channel":
      if (!live && !ctx.editing) return null;
      return btn(
        t("Previous channel"),
        ["playerPrevChannel"],
        <History size={s} strokeWidth={1.9} />,
        x?.onPrevChannel,
      );
    case "jump-start":
      if (!vod && !ctx.editing) return null;
      return btn(
        t("Jump to start"),
        ["playerStart"],
        <ChevronFirst size={s} strokeWidth={1.9} />,
        x?.onJump ? () => x.onJump?.(0) : undefined,
      );
    case "jump-end":
      if (!vod && !ctx.editing) return null;
      return btn(
        t("Jump to end"),
        ["playerEnd"],
        <ChevronLast size={s} strokeWidth={1.9} />,
        x?.onJump ? () => x.onJump?.(Math.max(0, ctx.durationSec - 0.5)) : undefined,
      );
    case "jump-digits":
      if (!vod && !ctx.editing) return null;
      return <JumpDigits ctx={ctx} />;
    case "edit-layout":
      if (!x?.onEditLayout && !ctx.editing) return null;
      return btn(
        t("Edit player layout"),
        ["playerEditLayout"],
        <LayoutTemplate size={s} strokeWidth={1.9} />,
        x?.onEditLayout,
      );
  }
}

function AbLoopButton({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const loop = ctx.extras?.loop;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useMenuDismiss(open, wrapRef, () => setOpen(false));
  const a = loop?.a ?? null;
  const b = loop?.b ?? null;
  const active = a != null && b != null && b > a;
  const status = active
    ? t("Looping {a} – {b}", { a: fmtTime(a), b: fmtTime(b) })
    : a != null
      ? t("Start set at {a}", { a: fmtTime(a) })
      : t("Off");
  const rows: { label: string; hotkey: HotkeyId; run?: () => void; disabled?: boolean }[] = [
    { label: t("Set loop start (A)"), hotkey: "playerLoopStart", run: loop?.setA },
    { label: t("Set loop end (B)"), hotkey: "playerLoopEnd", run: loop?.setB, disabled: a == null },
    {
      label: t("Clear A-B loop"),
      hotkey: "playerLoopClear",
      run: loop?.clear,
      disabled: a == null && b == null,
    },
  ];
  const { Button, iconSize } = ctx;
  return (
    <div ref={wrapRef} className="relative">
      <Tooltip
        label={
          <span className="inline-flex flex-col gap-0.5">
            <span>{t("A-B loop")}</span>
            <span className="text-white/60 tabular-nums">{status}</span>
          </span>
        }
        hidden={open}
        side={ctx.tooltipSide}
      >
        <Button
          onClick={() => setOpen((o) => !o)}
          ariaLabel={t("A-B loop")}
          active={active || open}
        >
          <Repeat size={iconSize} strokeWidth={1.9} className={active ? "text-accent" : ""} />
        </Button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-60 -translate-x-1/2 rounded-md bg-elevated p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] animate-menu-pop"
        >
          <div className="px-2.5 pb-1.5 pt-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
              {t("A-B loop")}
            </div>
            <div className="mt-0.5 text-[12px] tabular-nums text-ink-muted">{status}</div>
          </div>
          {rows.map((r) => (
            <MenuRow
              key={r.hotkey}
              label={r.label}
              hotkey={r.hotkey}
              disabled={r.disabled || !r.run}
              onClick={() => {
                r.run?.();
                if (r.hotkey !== "playerLoopStart") setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Click opens the save chooser; right-click or hold opens a menu that also changes the clip length.
function ClipButton({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const settings = useSettingsSelector((s) => ({ clipLengthSec: s.clipLengthSec }));
  const update = useSettingsUpdate();
  const x = ctx.extras;
  const seconds = sanitizeClipLength(settings.clipLengthSec, DEFAULT.clipLengthSec);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  useMenuDismiss(open, wrapRef, () => setOpen(false));
  const cancelHold = () => {
    if (holdRef.current != null) window.clearTimeout(holdRef.current);
    holdRef.current = null;
  };
  const label = t("Save the last {n} seconds", { n: seconds });
  const { Button, iconSize } = ctx;
  const save = (withSubs: boolean) => {
    setOpen(false);
    x?.onClipSave?.(withSubs);
  };
  const step =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas/60 text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";
  const row =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink transition-colors hover:bg-canvas/60 disabled:cursor-not-allowed disabled:text-ink-subtle";
  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerDownCapture={(e) => {
        if (e.button !== 0 || open || !x?.onClip) return;
        heldRef.current = false;
        cancelHold();
        holdRef.current = window.setTimeout(() => {
          holdRef.current = null;
          heldRef.current = true;
          setOpen(true);
        }, 380);
      }}
      onPointerUpCapture={cancelHold}
      onPointerLeave={cancelHold}
      onClickCapture={(e) => {
        if (!heldRef.current) return;
        heldRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        if (!x?.onClip) return;
        e.preventDefault();
        setOpen(true);
      }}
    >
      <Tooltip
        label={
          <span className="inline-flex flex-col items-center gap-1">
            {withHotkey(label, "playerClipRecord")}
            <span className="text-white/60">{t("Right-click or hold for more options")}</span>
          </span>
        }
        hidden={open}
        side={ctx.tooltipSide}
      >
        <Button onClick={x?.onClip} ariaLabel={label} active={open} disabled={!x?.onClip}>
          <Clapperboard size={iconSize} strokeWidth={1.9} />
        </Button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-60 -translate-x-1/2 rounded-md bg-elevated p-1.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] animate-menu-pop"
        >
          <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
            {t("Save video clip")}
          </div>
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink">
            <span className="min-w-0 flex-1 truncate">{t("Clip length")}</span>
            <button
              type="button"
              aria-label={t("Shorter")}
              disabled={seconds <= CLIP_LENGTH_OPTIONS[0]}
              onClick={() => update({ clipLengthSec: nudgeStep(seconds, -1, CLIP_LENGTH_OPTIONS) })}
              className={step}
            >
              <Minus size={14} strokeWidth={2.4} />
            </button>
            <span className="w-10 text-center tabular-nums">{t("{n}s", { n: seconds })}</span>
            <button
              type="button"
              aria-label={t("Longer")}
              disabled={seconds >= CLIP_LENGTH_OPTIONS[CLIP_LENGTH_OPTIONS.length - 1]}
              onClick={() => update({ clipLengthSec: nudgeStep(seconds, 1, CLIP_LENGTH_OPTIONS) })}
              className={step}
            >
              <Plus size={14} strokeWidth={2.4} />
            </button>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={!x?.onClipSave}
            onClick={() => save(true)}
            className={row}
          >
            <Captions size={15} strokeWidth={2.1} className="text-ink-muted" />
            <span className="min-w-0 flex-1 truncate">{t("With subtitles")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!x?.onClipSave}
            onClick={() => save(false)}
            className={row}
          >
            <CaptionsOff size={15} strokeWidth={2.1} className="text-ink-muted" />
            <span className="min-w-0 flex-1 truncate">{t("Without subtitles")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Hovering marks the ten targets on the seek bar; clicking opens a grid of their frames, keys and times.
function JumpDigits({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const jump = ctx.extras?.onJump;
  const dur = ctx.durationSec;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pos = usePlaybackPositionGated(open);
  useMenuDismiss(open, wrapRef, () => setOpen(false));
  const menuRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const wrap = wrapRef.current?.getBoundingClientRect();
    const w = menuRef.current?.offsetWidth ?? 0;
    if (!wrap || !w) return;
    const left = wrap.left + wrap.width / 2 - w / 2;
    const max = window.innerWidth - 16 - w;
    setShift(left < 16 ? 16 - left : left > max ? max - left : 0);
  }, [open]);
  const modifier = hotkeyText("playerJumpDigits");
  const keyFor = (d: number) => (modifier ? modifier.replace("0-9", String(d)) : "");
  const current = dur > 0 ? Math.min(9, Math.round((pos / dur) * 10)) : -1;
  const { Button, iconSize } = ctx;
  const [hovered, setHovered] = useState(false);
  const showMarks = hovered && !open && !!jump && dur > 0;
  useEffect(() => {
    setJumpMarksPinned(showMarks);
    return () => setJumpMarksPinned(false);
  }, [showMarks]);
  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Tooltip
        label={
          <span className="inline-flex items-center gap-2">
            <span>{t("Jump through video 0-9")}</span>
            {modifier && <KeyChips keys={[keyFor(0), keyFor(9)]} tone="tip" />}
          </span>
        }
        hidden={open}
        side={ctx.tooltipSide}
      >
        <Button
          onClick={() => setOpen((o) => !o)}
          ariaLabel={t("Jump through video 0-9")}
          active={open}
          disabled={!jump || dur <= 0}
        >
          <ListOrdered size={iconSize} strokeWidth={1.9} />
        </Button>
      </Tooltip>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-[min(520px,calc(100vw-32px))] rounded-md bg-elevated p-2.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] animate-menu-pop"
        >
          <div className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
            {t("Jump through video 0-9")}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {jumpTargets(Math.floor(dur)).map((at, d) => {
              const here = d === current;
              return (
                <button
                  key={d}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    jump?.(at);
                    setOpen(false);
                  }}
                  aria-label={t("Jump to {time}", { time: fmtTime(at) })}
                  className={`group relative aspect-video overflow-hidden rounded-md bg-canvas/70 ring-2 transition ${
                    here ? "ring-accent" : "ring-transparent hover:ring-white/40"
                  }`}
                >
                  <JumpFrame time={at} />
                  <span className="absolute start-1 top-1">
                    {modifier ? (
                      <KeyChips keys={[keyFor(d)]} tone="tip" />
                    ) : (
                      <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-white/15 bg-black/70 px-1 font-sans text-[11px] font-semibold text-white">
                        {d}
                      </kbd>
                    )}
                  </span>
                  <span className="absolute bottom-1 end-1 rounded bg-black/75 px-1 font-mono text-[10.5px] tabular-nums text-white">
                    {fmtTime(at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Frames come from the prefetch started when the source opened; a cell only waits for it to land.
function JumpFrame({ time }: { time: number }) {
  const bucket = Math.round(time / JUMP_FRAME_BUCKET_SEC);
  const [src, setSrc] = useState<string | null>(() => thumbCacheGet(bucket) ?? null);
  useEffect(() => {
    setSrc(thumbCacheGet(bucket) ?? null);
    return onTrickplayPrefetched(() => setSrc(thumbCacheGet(bucket) ?? null));
  }, [bucket]);
  if (!src)
    return (
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white/8 to-transparent"
      />
    );
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-90"
    />
  );
}

function useMenuDismiss(
  open: boolean,
  wrapRef: React.RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  usePlayerChromeHold(open);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    // Capture and stop Escape so closing the menu never also reaches the player's close key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, wrapRef, close]);
}

export function MenuRow({
  label,
  hotkey,
  onClick,
  disabled,
}: {
  label: string;
  hotkey: HotkeyId;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink transition-colors hover:bg-canvas/60 disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:bg-transparent"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <KeyChips ids={[hotkey]} />
    </button>
  );
}
