import type { GifState } from "@/views/player/hooks/use-gif-recorder";

/** Hotkey-only player actions that the optional buttons call; absent where the action is unavailable. */
export type PlayerExtras = {
  loop?: {
    a: number | null;
    b: number | null;
    setA: () => void;
    setB: () => void;
    clear: () => void;
  };
  gif?: { state: GifState; toggle: () => void };
  onClip?: () => void;
  onClipSave?: (withSubs: boolean) => void;
  stats?: { on: boolean; toggle: () => void };
  screenLock?: () => void;
  onReloadSource?: () => void;
  onRestartServer?: () => void;
  onPrevChannel?: () => void;
  onFrameStep?: (dir: 1 | -1) => void;
  onJump?: (sec: number) => void;
  onEditLayout?: () => void;
};
