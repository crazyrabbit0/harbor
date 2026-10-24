import {
  Activity,
  Captions,
  CaptionsOff,
  Cast,
  ChevronFirst,
  ChevronLast,
  Clock,
  Crop,
  Download,
  FastForward,
  Languages,
  Moon,
  Pause,
  Play,
  Rewind,
  ScanSearch,
  SkipBack,
  SkipForward,
  Sparkles,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { ThreeLiquidGlassSurface } from "@/components/ThreeLiquidGlassSurface";
import { JAKARTA, type VolumeHudPosition } from "./volume-indicator";

export type ActionIcon =
  | "play"
  | "pause"
  | "rewind"
  | "forward"
  | "jump"
  | "start"
  | "end"
  | "frame-back"
  | "frame-forward"
  | "subtitles"
  | "subtitles-off"
  | "aspect"
  | "zoom"
  | "stats"
  | "sleep"
  | "upscale"
  | "video"
  | "audio"
  | "download"
  | "cast";

/** A short confirmation for a player action: an uppercase title and the state it reached. */
export type ActionFeedback = { icon: ActionIcon; title: string; value: string };

export type ActionIndicatorState = { visible: boolean; feedback: ActionFeedback | null };

const ICONS: Record<ActionIcon, LucideIcon> = {
  play: Play,
  pause: Pause,
  rewind: Rewind,
  forward: FastForward,
  jump: Clock,
  start: ChevronFirst,
  end: ChevronLast,
  "frame-back": SkipBack,
  "frame-forward": SkipForward,
  subtitles: Captions,
  "subtitles-off": CaptionsOff,
  aspect: Crop,
  zoom: ZoomIn,
  stats: Activity,
  sleep: Moon,
  upscale: Sparkles,
  video: ScanSearch,
  audio: Languages,
  download: Download,
  cast: Cast,
};

// Same anchors as the volume and speed cards, centred by transform because this card grows with its label.
const POSITION_CLASS: Record<VolumeHudPosition, string> = {
  center: "left-1/2 top-[calc(50%-2.25rem)] -translate-x-1/2",
  top: "left-1/2 top-9 -translate-x-1/2",
  "top-left": "left-6 top-9",
  "top-right": "right-6 top-9",
};

export function ActionIndicator({
  state,
  position,
}: {
  state: ActionIndicatorState;
  position: VolumeHudPosition;
}) {
  const feedback = state.feedback;
  const Icon = feedback ? ICONS[feedback.icon] : Play;
  return (
    <div
      className={`pointer-events-none absolute z-30 w-max min-w-64 max-w-[min(30rem,calc(100%-3rem))] ${POSITION_CLASS[position]}`}
    >
      <ThreeLiquidGlassSurface
        radius="20px"
        shaderRadius={0.28}
        intensity={0.1}
        causticsStrength={0.8}
        refractionStrength={1.42}
        lensStrength={1.05}
        motionSpeed={0.5}
        interactive={false}
        alwaysActive
        backdropBlur
        defaultStyle={{ backgroundColor: "rgba(8,12,18,0.35)" }}
        style={{
          overflow: "hidden",
          transition: "opacity 200ms ease-out",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(80,150,225,0.07), 0 22px 58px -22px rgba(0,0,0,0.90)",
        }}
        className={`harbor-together-surface relative w-full rounded-xl border border-white/[0.15] transition-opacity duration-200 ease-out ${
          state.visible && feedback ? "opacity-100" : "opacity-0"
        }`}
        contentClassName="flex w-full items-center gap-3.5 py-3 ps-3 pe-4 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.68)]"
      >
        <span className="flex shrink-0 items-center justify-center text-white/95">
          <Icon size={26} strokeWidth={2.1} />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-5">
          <span
            className="min-w-0 text-[14px] font-semibold uppercase leading-snug tracking-[0.18em]"
            style={{ fontFamily: JAKARTA }}
          >
            {feedback?.title}
          </span>
          <span
            className="shrink-0 text-[17px] font-semibold tabular-nums leading-none text-white/92"
            style={{ fontFamily: JAKARTA }}
          >
            {feedback?.value}
          </span>
        </span>
      </ThreeLiquidGlassSurface>
    </div>
  );
}
