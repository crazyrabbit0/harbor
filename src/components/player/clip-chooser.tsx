import { Captions, CaptionsOff, Minus, Plus, Scissors, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CLIP_LENGTH_OPTIONS, nudgeStep, sanitizeClipLength } from "@/lib/seek-step";
import { useSettingsSelector, useSettingsUpdate } from "@/lib/settings";
import { DEFAULT } from "@/lib/settings/defaults";

const STEP_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

export function ClipChooser({
  open,
  saving,
  onPick,
  onClose,
}: {
  open: boolean;
  saving: boolean;
  onPick: (withSubs: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const settings = useSettingsSelector((s) => ({ clipLengthSec: s.clipLengthSec }));
  const update = useSettingsUpdate();
  const seconds = sanitizeClipLength(settings.clipLengthSec, DEFAULT.clipLengthSec);
  if (saving || !open) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 animate-[harbor-fade-in_160ms_ease-out]">
      <div className="pointer-events-auto flex flex-col gap-3.5 rounded-2xl border border-white/15 bg-black/85 p-5 text-white backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2">
          <Scissors size={15} strokeWidth={2.2} className="text-white/80" />
          <span className="text-[13.5px] font-semibold">{t("Save the last")}</span>
          <div className="ms-1 flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("Shorter")}
              disabled={seconds <= CLIP_LENGTH_OPTIONS[0]}
              onClick={() => update({ clipLengthSec: nudgeStep(seconds, -1, CLIP_LENGTH_OPTIONS) })}
              className={STEP_BTN}
            >
              <Minus size={13} strokeWidth={2.4} />
            </button>
            <span className="min-w-[3.25rem] text-center text-[13.5px] font-semibold tabular-nums">
              {t("{n}s", { n: seconds })}
            </span>
            <button
              type="button"
              aria-label={t("Longer")}
              disabled={seconds >= CLIP_LENGTH_OPTIONS[CLIP_LENGTH_OPTIONS.length - 1]}
              onClick={() => update({ clipLengthSec: nudgeStep(seconds, 1, CLIP_LENGTH_OPTIONS) })}
              className={STEP_BTN}
            >
              <Plus size={13} strokeWidth={2.4} />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Cancel")}
            className="ms-auto flex h-6 w-6 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => onPick(true)}
            className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[13.5px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Captions size={16} strokeWidth={2.2} />
            {t("With subtitles")}
          </button>
          <button
            type="button"
            onClick={() => onPick(false)}
            className="flex h-11 items-center gap-2 rounded-full bg-white/15 px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/25"
          >
            <CaptionsOff size={16} strokeWidth={2.2} />
            {t("Without subtitles")}
          </button>
        </div>
      </div>
    </div>
  );
}
