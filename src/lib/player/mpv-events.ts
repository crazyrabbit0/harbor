import { mpvFailureSnapshot } from "./mpv-failure";
import type { StartupProfile } from "./mpv-config";
import { applyMpvProperty } from "./mpv-tracks";
import type { PlayerSnapshot } from "./bridge";
import type { MpvEvent as NativeMpvEvent } from "@/lib/generated/mpv-ipc";

// The native payload union, plus a loose end-file reason the reducer still tolerates.
export type MpvEvent = NativeMpvEvent | { event: "end-file"; reason?: string };

// Bridge state an mpv event reads or changes; the bridge copies it in before and back after each event.
export type MpvEventState = {
  snap: PlayerSnapshot;
  observedPaused: boolean | null;
  observedMediaPath: string | null;
  expectedMediaPath: string | null;
  currentIsLive: boolean | null;
  currentStartupProfile: StartupProfile | null;
  mediaLoadId: number;
  steadyBufferLoadId: number;
  suppressEndFileUntil: number;
};

// Side effects the bridge runs after applying the new state, in this order.
export type MpvEventEffect =
  | { kind: "svp-filter-failed" }
  | { kind: "player-failed" }
  | { kind: "property"; name: string; data: unknown }
  | { kind: "trace-mark"; mark: "file-loaded" | "first-frame" }
  | { kind: "trace-ready" }
  | { kind: "steady-buffer"; profile: StartupProfile }
  | { kind: "emit" };

export type MpvEventResult = { state: MpvEventState; effects: MpvEventEffect[] };

export function normalizeMediaPath(path: string): string {
  return path.replace(/\\/g, "/");
}

const isSvpFailureLog = ({
  prefix,
  level,
  text,
}: {
  prefix: string;
  level: string;
  text: string;
}) => {
  return (
    text.includes("Creating filter 'vapoursynth' failed") ||
    (prefix.includes("vapoursynth") && (level === "fatal" || level === "error"))
  );
};

// Applies one mpv event to a copy of the bridge state; it never calls mpv, so the lifecycle rules are testable.
export function reduceMpvEvent(current: MpvEventState, raw: MpvEvent, now: number): MpvEventResult {
  const state: MpvEventState = { ...current, snap: { ...current.snap } };
  const snap = state.snap;
  const effects: MpvEventEffect[] = [];
  if (raw.event === "log") {
    if (isSvpFailureLog(raw)) effects.push({ kind: "svp-filter-failed" });
  } else if (raw.event === "player-failure") {
    state.snap = mpvFailureSnapshot(snap, raw.reason ?? "");
    effects.push({ kind: "player-failed" }, { kind: "emit" });
  } else if (raw.event === "property-change") {
    const { name, data } = raw;
    applyMpvProperty(snap, name, data);
    if (name === "path" && typeof data === "string") state.observedMediaPath = data;
    if (name === "pause" && typeof data === "boolean") {
      state.observedPaused = data;
      snap.status = data ? "paused" : "playing";
    }
    effects.push({ kind: "property", name, data }, { kind: "emit" });
  } else if (raw.event === "end-file") {
    const reason = raw.reason?.toLowerCase();
    if (reason === "stop" || reason === "quit" || reason === "redirect")
      return { state: current, effects };
    if (now < state.suppressEndFileUntil) return { state: current, effects };
    if (reason && reason !== "eof") {
      snap.status = "error";
      snap.errorCode = "decode";
      snap.errorMessage = `mpv ended playback: ${reason}`;
    } else {
      snap.status = "ended";
    }
    effects.push({ kind: "emit" });
  } else if (raw.event === "file-loaded") {
    snap.status = state.observedPaused === true ? "paused" : "playing";
    snap.errorCode = null;
    snap.errorMessage = null;
    effects.push({ kind: "trace-mark", mark: "file-loaded" }, { kind: "emit" });
  } else if (raw.event === "playback-restart") {
    if (
      state.expectedMediaPath &&
      state.observedMediaPath &&
      normalizeMediaPath(state.expectedMediaPath) !== normalizeMediaPath(state.observedMediaPath)
    ) {
      return { state: current, effects };
    }
    snap.status = state.observedPaused === true ? "paused" : "playing";
    snap.buffering = false; // Playback recovered, including when the user remains paused.
    snap.firstFrameReady = true;
    if (
      state.currentIsLive === false &&
      state.currentStartupProfile &&
      state.steadyBufferLoadId !== state.mediaLoadId
    ) {
      state.steadyBufferLoadId = state.mediaLoadId;
      effects.push({ kind: "steady-buffer", profile: state.currentStartupProfile });
    }
    snap.errorCode = null;
    snap.errorMessage = null;
    effects.push(
      { kind: "trace-mark", mark: "first-frame" },
      { kind: "trace-ready" },
      { kind: "emit" },
    );
  }
  return { state, effects };
}
