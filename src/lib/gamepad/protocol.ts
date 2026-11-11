export type GpButton =
  | "south"
  | "east"
  | "north"
  | "west"
  | "lb"
  | "rb"
  | "lt"
  | "rt"
  | "start"
  | "back"
  | "guide"
  | "lstick"
  | "rstick"
  | "dup"
  | "ddown"
  | "dleft"
  | "dright";

export type GpAxis = "lx" | "ly" | "rx" | "ry";

export type { GamepadInfo } from "@/lib/generated/gamepad-ipc";

export type GamepadEventPayload =
  | { kind: "connected"; id: number; name: string }
  | { kind: "disconnected"; id: number }
  | { kind: "button"; id: number; button: GpButton; pressed: boolean }
  | { kind: "axis"; id: number; axis: GpAxis; value: number };
