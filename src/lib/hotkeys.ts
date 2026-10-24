export type HotkeyScope = "Player" | "Global" | "Manga";

export type HotkeyId =
  | "playerClose"
  | "playerPlayPause"
  | "playerSeekBack10"
  | "playerSeekForward10"
  | "playerSeekBackShort"
  | "playerSeekForwardShort"
  | "playerSeekBack30"
  | "playerSeekForward30"
  | "playerFrameBack"
  | "playerFrameForward"
  | "playerVolumeUp"
  | "playerVolumeDown"
  | "playerMute"
  | "playerFullscreen"
  | "playerPip"
  | "playerSubtitleCycle"
  | "playerSubtitleCycleAlt"
  | "playerSubtitleCycleBack"
  | "playerAudioCycle"
  | "playerAudioCycleBack"
  | "playerDownload"
  | "playerCast"
  | "playerEditLayout"
  | "playerLoopStart"
  | "playerLoopEnd"
  | "playerLoopClear"
  | "playerNextEpisode"
  | "playerPrevEpisode"
  | "playerPrevChannel"
  | "playerStart"
  | "playerEnd"
  | "playerStats"
  | "playerAnime4kToggle"
  | "playerAnime4kOn"
  | "playerAnime4kOff"
  | "playerRtxHdrToggle"
  | "playerRtxVsrToggle"
  | "playerCrop"
  | "playerSkipSegment"
  | "playerUndoSkip"
  | "playerPanscanUp"
  | "playerPanscanDown"
  | "playerScreenshot"
  | "playerGifRecord"
  | "playerClipRecord"
  | "playerSpeedDown"
  | "playerSpeedUp"
  | "playerSubDelayDown"
  | "playerSubDelayUp"
  | "playerStreamSwitcher"
  | "playerEpisodePanel"
  | "playerTvGuide"
  | "playerDvr"
  | "playerSleep"
  | "playerScreenLock"
  | "playerReloadSource"
  | "playerRestartServer"
  | "globalUiScaleUp"
  | "globalUiScaleDown"
  | "globalUiScaleReset"
  | "globalSearchFocus"
  | "globalSettingsOpen"
  | "globalSearchOverlay"
  | "globalRoomNext"
  | "globalRoomPrev"
  | "globalRoomDigits"
  | "globalWindowFullscreen"
  | "globalMemoryMonitor"
  | "globalTestError"
  | "playerJumpDigits"
  | "playerChatCompose"
  | "mangaFullscreen"
  | "mangaMatch";

export type HotkeyDef = {
  id: HotkeyId;
  scope: HotkeyScope;
  label: string;
  description: string;
  defaultBinding: string;
  group?: string;
};

export const HOTKEYS: HotkeyDef[] = [
  {
    id: "globalSearchFocus",
    scope: "Global",
    group: "Navigation",
    label: "Focus search",
    description: "Jump to the top-bar search from anywhere.",
    defaultBinding: "/",
  },
  {
    id: "globalSettingsOpen",
    scope: "Global",
    group: "Navigation",
    label: "Open settings",
    description: "Open Harbor's settings outside playback.",
    defaultBinding: "ctrl+s",
  },
  {
    id: "globalSearchOverlay",
    scope: "Global",
    group: "Navigation",
    label: "Open search",
    description: "Open or close the search overlay.",
    defaultBinding: "ctrl+k",
  },
  {
    id: "globalRoomNext",
    scope: "Global",
    group: "Navigation",
    label: "Next room",
    description: "Go to the next room in the sidebar. Off while the player is open.",
    defaultBinding: "ctrl+Tab",
  },
  {
    id: "globalRoomPrev",
    scope: "Global",
    group: "Navigation",
    label: "Previous room",
    description: "Go to the previous room in the sidebar. Off while the player is open.",
    defaultBinding: "ctrl+shift+Tab",
  },
  {
    id: "globalRoomDigits",
    scope: "Global",
    group: "Navigation",
    label: "Go to room 1-9",
    description:
      "Hold this modifier and press 1-9 to open that sidebar room. When changing it, press any digit with the modifier you want, or Delete to turn it off. Off while the player is open.",
    defaultBinding: "ctrl",
  },
  {
    id: "globalWindowFullscreen",
    scope: "Global",
    group: "Interface",
    label: "Toggle window fullscreen",
    description: "Make Harbor's window fill the screen, or restore it.",
    defaultBinding: "F11",
  },
  {
    id: "globalMemoryMonitor",
    scope: "Global",
    group: "Developer",
    label: "Toggle memory monitor",
    description: "Show or hide the memory and cache monitor.",
    defaultBinding: "ctrl+shift+m",
  },
  {
    id: "globalTestError",
    scope: "Global",
    group: "Developer",
    label: "Show test error page",
    description: "Open Harbor's error page with a sample error, to check how it looks.",
    defaultBinding: "ctrl+shift+e",
  },
  {
    id: "globalUiScaleUp",
    scope: "Global",
    group: "Interface",
    label: "Increase interface scale",
    description: "Make Harbor's interface larger.",
    defaultBinding: "ctrl+=",
  },
  {
    id: "globalUiScaleDown",
    scope: "Global",
    group: "Interface",
    label: "Decrease interface scale",
    description: "Make Harbor's interface smaller.",
    defaultBinding: "ctrl+-",
  },
  {
    id: "globalUiScaleReset",
    scope: "Global",
    group: "Interface",
    label: "Reset interface scale",
    description: "Restore Harbor's interface scale to 100%.",
    defaultBinding: "ctrl+0",
  },

  {
    id: "playerClose",
    scope: "Player",
    group: "Playback",
    label: "Close player",
    description: "Exit playback and return to the previous view.",
    defaultBinding: "Escape",
  },
  {
    id: "playerPlayPause",
    scope: "Player",
    group: "Playback",
    label: "Play / pause",
    description: "Toggle playback.",
    defaultBinding: "Space",
  },
  {
    id: "playerFullscreen",
    scope: "Player",
    group: "Playback",
    label: "Toggle fullscreen",
    description: "Enter or exit fullscreen.",
    defaultBinding: "f",
  },
  {
    id: "playerPip",
    scope: "Player",
    group: "Playback",
    label: "Picture-in-picture",
    description: "Pop the video into a small always-on-top window, or restore it.",
    defaultBinding: "u",
  },
  {
    id: "playerScreenLock",
    scope: "Player",
    group: "Playback",
    label: "Lock player controls",
    description: "Block mouse and keyboard input until you unlock the player.",
    defaultBinding: "ctrl+l",
  },
  {
    id: "playerStats",
    scope: "Player",
    group: "Playback",
    label: "Toggle stats overlay",
    description: "Show or hide the playback stats overlay.",
    defaultBinding: "i",
  },
  {
    id: "playerSkipSegment",
    scope: "Player",
    group: "Playback",
    label: "Skip intro / credits",
    description: "Skip the intro, recap, credits or ad that is playing now.",
    defaultBinding: "k",
  },
  {
    id: "playerUndoSkip",
    scope: "Player",
    group: "Playback",
    label: "Undo skip",
    description: "Jump back to where you were before the last skip, while Undo skip is showing.",
    defaultBinding: "shift+k",
  },
  {
    id: "playerCrop",
    scope: "Player",
    group: "Playback",
    label: "Cycle aspect / crop",
    description: "Cycle aspect and crop modes: Fit, Fill, Zoom, 16:9, 4:3, Original.",
    defaultBinding: "v",
  },
  {
    id: "playerPanscanDown",
    scope: "Player",
    group: "Playback",
    label: "Zoom out",
    description: "Step zoom out to restore baked-in black bars (Zoom mode).",
    defaultBinding: "-",
  },
  {
    id: "playerPanscanUp",
    scope: "Player",
    group: "Playback",
    label: "Zoom in",
    description: "Step zoom in to crop baked-in black bars (Zoom mode).",
    defaultBinding: "=",
  },
  {
    id: "playerScreenshot",
    scope: "Player",
    group: "Playback",
    label: "Screenshot",
    description:
      "Save the current frame (video only, no subtitles) as a PNG to the Screenshots folder.",
    defaultBinding: "p",
  },
  {
    id: "playerGifRecord",
    scope: "Player",
    group: "Playback",
    label: "Record GIF",
    description:
      "Start or stop recording a GIF of the video (no subtitles). Saves to the GIFs folder.",
    defaultBinding: "o",
  },
  {
    id: "playerClipRecord",
    scope: "Player",
    group: "Playback",
    label: "Save video clip",
    description:
      "Save the last seconds of video, set by Clip length, as a clip with audio, choosing subtitles on or off. Saves to the Video clips folder.",
    defaultBinding: "c",
  },
  {
    id: "playerDownload",
    scope: "Player",
    group: "Playback",
    label: "Download video",
    description: "Start downloading the video you are watching, or cancel a download in progress.",
    defaultBinding: "d",
  },
  {
    id: "playerCast",
    scope: "Player",
    group: "Playback",
    label: "Cast",
    description: "Open the list of devices to cast to.",
    defaultBinding: "shift+c",
  },
  {
    id: "playerEditLayout",
    scope: "Player",
    group: "Panels",
    label: "Edit player layout",
    description: "Open the layout editor over the video, without leaving playback.",
    defaultBinding: "ctrl+e",
  },
  {
    id: "playerAnime4kToggle",
    scope: "Player",
    group: "Playback",
    label: "Toggle Anime4K",
    description: "Turn Anime4K upscaling on (auto) or off. Only active when shaders are available.",
    defaultBinding: "a",
  },
  {
    id: "playerAnime4kOn",
    scope: "Player",
    group: "Playback",
    label: "Anime4K on",
    description: "Turn Anime4K upscaling on. Only active when shaders are available.",
    defaultBinding: "alt+a",
  },
  {
    id: "playerAnime4kOff",
    scope: "Player",
    group: "Playback",
    label: "Anime4K off",
    description: "Turn Anime4K upscaling off.",
    defaultBinding: "shift+a",
  },
  {
    id: "playerRtxHdrToggle",
    scope: "Player",
    group: "Playback",
    label: "Toggle RTX Video HDR",
    description:
      "Toggle RTX Video HDR during mpv playback. Unavailable while HDR-to-SDR tonemapping or SVP is active.",
    defaultBinding: "ctrl+h",
  },
  {
    id: "playerRtxVsrToggle",
    scope: "Player",
    group: "Playback",
    label: "Toggle RTX Super Resolution",
    description:
      "Toggle RTX Video Super Resolution during mpv playback. Unavailable while SVP is active.",
    defaultBinding: "ctrl+u",
  },

  {
    id: "playerSeekBack10",
    scope: "Player",
    group: "Seeking",
    label: "Seek back",
    description: "Jump back by the Back seek step set under Behavior.",
    defaultBinding: "ArrowLeft",
  },
  {
    id: "playerSeekForward10",
    scope: "Player",
    group: "Seeking",
    label: "Seek forward",
    description: "Jump forward by the Forward seek step set under Behavior.",
    defaultBinding: "ArrowRight",
  },
  {
    id: "playerSeekBackShort",
    scope: "Player",
    group: "Seeking",
    label: "Short seek back",
    description: "Jump back by the shorter Short seek step set under Behavior.",
    defaultBinding: "shift+ArrowLeft",
  },
  {
    id: "playerSeekForwardShort",
    scope: "Player",
    group: "Seeking",
    label: "Short seek forward",
    description: "Jump forward by the shorter Short seek step set under Behavior.",
    defaultBinding: "shift+ArrowRight",
  },
  {
    id: "playerSeekBack30",
    scope: "Player",
    group: "Seeking",
    label: "Long seek back",
    description: "Jump back by the Long seek step set under Behavior.",
    defaultBinding: ",",
  },
  {
    id: "playerSeekForward30",
    scope: "Player",
    group: "Seeking",
    label: "Long seek forward",
    description: "Jump forward by the Long seek step set under Behavior.",
    defaultBinding: ".",
  },
  {
    id: "playerFrameBack",
    scope: "Player",
    group: "Seeking",
    label: "Previous frame",
    description: "Step back one frame and pause. Frame-accurate on mpv.",
    defaultBinding: "shift+<",
  },
  {
    id: "playerFrameForward",
    scope: "Player",
    group: "Seeking",
    label: "Next frame",
    description: "Step forward one frame and pause. Frame-accurate on mpv.",
    defaultBinding: "shift+>",
  },
  {
    id: "playerStart",
    scope: "Player",
    group: "Seeking",
    label: "Jump to start",
    description: "Seek to the beginning.",
    defaultBinding: "Home",
  },
  {
    id: "playerEnd",
    scope: "Player",
    group: "Seeking",
    label: "Jump to end",
    description: "Seek to the last half second.",
    defaultBinding: "End",
  },
  {
    id: "playerJumpDigits",
    scope: "Player",
    group: "Seeking",
    label: "Jump through video 0-9",
    description:
      "Press 0-9 to jump to that tenth of the video (0 is the start, 5 the middle). When changing it, press any digit with the modifier you want, or Delete to turn it off.",
    defaultBinding: "none",
  },
  {
    id: "playerLoopStart",
    scope: "Player",
    group: "Seeking",
    label: "Set loop start (A)",
    description: "Mark where the A-B loop starts.",
    defaultBinding: "shift+i",
  },
  {
    id: "playerLoopEnd",
    scope: "Player",
    group: "Seeking",
    label: "Set loop end (B)",
    description: "Mark where the A-B loop ends; playback then repeats between the two marks.",
    defaultBinding: "shift+o",
  },
  {
    id: "playerLoopClear",
    scope: "Player",
    group: "Seeking",
    label: "Clear A-B loop",
    description: "Clear the A-B loop and play on normally.",
    defaultBinding: "shift+l",
  },

  {
    id: "playerVolumeUp",
    scope: "Player",
    group: "Volume",
    label: "Volume up",
    description: "Raise volume (hold Shift for big steps).",
    defaultBinding: "ArrowUp",
  },
  {
    id: "playerVolumeDown",
    scope: "Player",
    group: "Volume",
    label: "Volume down",
    description: "Lower volume (hold Shift for big steps).",
    defaultBinding: "ArrowDown",
  },
  {
    id: "playerMute",
    scope: "Player",
    group: "Volume",
    label: "Toggle mute",
    description: "Mute or unmute audio.",
    defaultBinding: "m",
  },

  {
    id: "playerSubtitleCycle",
    scope: "Player",
    group: "Tracks",
    label: "Cycle subtitles",
    description: "Cycle through available subtitle tracks.",
    defaultBinding: "s",
  },
  {
    id: "playerSubtitleCycleAlt",
    scope: "Player",
    group: "Tracks",
    label: "Cycle subtitles (alt)",
    description: "A second binding for the same action so muscle memory survives.",
    defaultBinding: "",
  },
  {
    id: "playerSubtitleCycleBack",
    scope: "Player",
    group: "Tracks",
    label: "Cycle subtitles backward",
    description: "Cycle through subtitle tracks in reverse order.",
    defaultBinding: "shift+s",
  },
  {
    id: "playerAudioCycle",
    scope: "Player",
    group: "Tracks",
    label: "Cycle audio tracks",
    description: "Switch to the next audio track.",
    defaultBinding: "y",
  },
  {
    id: "playerAudioCycleBack",
    scope: "Player",
    group: "Tracks",
    label: "Cycle audio tracks backward",
    description: "Switch to the previous audio track.",
    defaultBinding: "shift+y",
  },
  {
    id: "playerSubDelayDown",
    scope: "Player",
    group: "Tracks",
    label: "Subtitle delay −0.1s",
    description: "Shift subtitle timing earlier (Shift for fine steps).",
    defaultBinding: "z",
  },
  {
    id: "playerSubDelayUp",
    scope: "Player",
    group: "Tracks",
    label: "Subtitle delay +0.1s",
    description: "Shift subtitle timing later (Shift for fine steps).",
    defaultBinding: "x",
  },

  {
    id: "playerNextEpisode",
    scope: "Player",
    group: "Navigation",
    label: "Next episode",
    description: "Skip to the next episode if available.",
    defaultBinding: "n",
  },
  {
    id: "playerPrevEpisode",
    scope: "Player",
    group: "Navigation",
    label: "Previous episode",
    description: "Skip to the previous episode if available.",
    defaultBinding: "b",
  },
  {
    id: "playerChatCompose",
    scope: "Player",
    group: "Navigation",
    label: "Write a chat message",
    description: "Open the watch-party chat box (in a Together room).",
    defaultBinding: "t",
  },
  {
    id: "playerPrevChannel",
    scope: "Player",
    group: "Navigation",
    label: "Previous channel",
    description: "Jump back to the last live channel you watched (live TV only).",
    defaultBinding: "h",
  },

  {
    id: "playerSpeedDown",
    scope: "Player",
    group: "Speed",
    label: "Speed down",
    description: "Slow playback by 0.25x.",
    defaultBinding: "[",
  },
  {
    id: "playerSpeedUp",
    scope: "Player",
    group: "Speed",
    label: "Speed up",
    description: "Speed playback up by 0.25x.",
    defaultBinding: "]",
  },

  {
    id: "playerStreamSwitcher",
    scope: "Player",
    group: "Panels",
    label: "Stream switcher",
    description: "Open or close the in-player stream switcher.",
    defaultBinding: "w",
  },
  {
    id: "playerEpisodePanel",
    scope: "Player",
    group: "Panels",
    label: "Up next / episodes",
    description: "Open or close the episode panel.",
    defaultBinding: "e",
  },
  {
    id: "playerTvGuide",
    scope: "Player",
    group: "Panels",
    label: "TV guide",
    description: "Open or close the live TV guide (live channels only).",
    defaultBinding: "g",
  },
  {
    id: "playerDvr",
    scope: "Player",
    group: "Panels",
    label: "DVR / record",
    description: "Open or close the live TV recorder (live channels only).",
    defaultBinding: "r",
  },
  {
    id: "playerSleep",
    scope: "Player",
    group: "Panels",
    label: "Sleep at end of episode",
    description: "Toggle a sleep timer that pauses when this episode ends.",
    defaultBinding: "l",
  },

  {
    id: "playerReloadSource",
    scope: "Player",
    group: "Recovery",
    label: "Reload source",
    description: "Re-open the stream you are watching and pick it back up where you left off.",
    defaultBinding: "ctrl+alt+r",
  },
  {
    id: "playerRestartServer",
    scope: "Player",
    group: "Recovery",
    label: "Restart streaming server",
    description:
      "Restart Harbor's own streaming server, then reload the stream once it is back. Desktop only.",
    defaultBinding: "ctrl+alt+s",
  },

  {
    id: "mangaFullscreen",
    scope: "Manga",
    group: "Reader",
    label: "Toggle fullscreen",
    description: "Enter or exit fullscreen while reading.",
    defaultBinding: "f",
  },
  {
    id: "mangaMatch",
    scope: "Manga",
    group: "Reader",
    label: "Manga match",
    description: "Open the match picker to map the current manga to AniList or MyAnimeList.",
    defaultBinding: "c",
  },
];

export const HOTKEY_MAP: Record<HotkeyId, HotkeyDef> = Object.fromEntries(
  HOTKEYS.map((h) => [h.id, h]),
) as Record<HotkeyId, HotkeyDef>;

export function eventToBinding(e: KeyboardEvent): string {
  return bindingFor(e.key, e);
}

type Modifiers = Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

function bindingFor(eventKey: string, e: Modifiers): string {
  const mods: string[] = [];
  let key = eventKey;
  // Letters are stored lowercase, so Caps Lock never changes a binding and Shift+K is its own key.
  const isLetter = key.length === 1 && /[a-zA-Z]/.test(key);
  if (e.ctrlKey) mods.push("ctrl");
  if (e.shiftKey) mods.push("shift");
  if (e.altKey) mods.push("alt");
  if (e.metaKey) mods.push("meta");
  if (key === " ") key = "Space";
  if (isLetter) key = key.toLowerCase();
  return mods.length === 0 ? key : mods.join("+") + "+" + key;
}

// Digit groups store only their modifier ("none", "ctrl", "ctrl+shift" or "off"); the digit comes from the key press.
const DIGIT_GROUPS = new Set<HotkeyId>(["playerJumpDigits", "globalRoomDigits"]);
export const DIGIT_GROUP_OFF = "off";
const NO_MODIFIER = "none";

export function digitGroup(id: HotkeyId): boolean {
  return DIGIT_GROUPS.has(id);
}

/** The modifier a capture key press picks for a digit group, or null while only a modifier is held. */
export function digitModifier(e: KeyboardEvent): string | null {
  if (/^[0-9]$/.test(e.key) || /^Digit[0-9]$/.test(e.code)) {
    const binding = bindingFor("0", e);
    return binding === "0" ? NO_MODIFIER : binding.slice(0, -2);
  }
  if (e.key === "Delete" || e.key === "Backspace") return DIGIT_GROUP_OFF;
  return null;
}

/** The digit 0-9 a press triggers for a digit group bound to `modifier`, or null. */
export function digitFromEvent(e: KeyboardEvent, modifier: string): number | null {
  if (!modifier || modifier === DIGIT_GROUP_OFF) return null;
  const match = /^Digit([0-9])$/.exec(e.code ?? "") ?? /^([0-9])$/.exec(e.key);
  if (!match) return null;
  const binding = bindingFor(match[1], e);
  const wanted = modifier === NO_MODIFIER ? match[1] : `${modifier}+${match[1]}`;
  return binding === wanted ? Number(match[1]) : null;
}

/** Global keys stay live inside the player, so the two scopes share one key space. */
export function sharesKeys(a: HotkeyScope, b: HotkeyScope): boolean {
  return a === b || (a !== "Manga" && b !== "Manga");
}

function expand(id: HotkeyId, binding: string): string[] {
  if (!binding || binding === DIGIT_GROUP_OFF) return [];
  if (!digitGroup(id)) return [binding];
  const digits = id === "globalRoomDigits" ? "123456789" : "0123456789";
  return [...digits].map((d) => (binding === NO_MODIFIER ? d : `${binding}+${d}`));
}

export function bindingsOverlap(
  a: HotkeyId,
  aBinding: string,
  b: HotkeyId,
  bBinding: string,
): boolean {
  const left = expand(a, aBinding);
  return expand(b, bBinding).some((key) => left.includes(key));
}

export function isModifierOnly(e: KeyboardEvent): boolean {
  return e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta";
}

export function isTypingTarget(e: KeyboardEvent): boolean {
  const node = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  const role = node.getAttribute("role");
  return role === "textbox" || role === "searchbox" || role === "combobox";
}

export function shouldHandleGlobalKeyboardEvent(e: KeyboardEvent): boolean {
  if (typeof document !== "undefined" && !document.hasFocus()) return false;
  return !e.isComposing && e.key !== "Process" && !isTypingTarget(e);
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  return eventToBinding(e) === binding;
}

/** Overrides for windows that run without SettingsProvider (PiP, video PiP); read from the settings mirror on each press. */
export function storedHotkeyOverrides(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem("harbor.settings") ?? "{}") as {
      hotkeys?: unknown;
    };
    const hotkeys = parsed.hotkeys;
    return hotkeys && typeof hotkeys === "object" ? (hotkeys as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The player hotkey a press matches, for players outside the main view that reuse its keys. */
export function matchPlayerKey(
  e: KeyboardEvent,
  overrides: Record<string, string>,
  ids: readonly HotkeyId[],
): HotkeyId | null {
  const binding = eventToBinding(e);
  return ids.find((id) => effectiveBinding(id, overrides) === binding) ?? null;
}

export function effectiveBinding(id: HotkeyId, overrides: Record<string, string>): string {
  const ov = overrides[id];
  if (typeof ov === "string" && ov.length > 0) return ov;
  const def = HOTKEY_MAP[id];
  // Digit groups run last in the player, so one digit taken by another action never disables the rest.
  if (digitGroup(id)) return def.defaultBinding;
  // A key the user picked for another action wins over a default, so new defaults never steal it.
  const claimed = Object.entries(overrides).some(
    ([other, binding]) =>
      other !== id &&
      other in HOTKEY_MAP &&
      sharesKeys(HOTKEY_MAP[other as HotkeyId].scope, def.scope) &&
      bindingsOverlap(id, def.defaultBinding, other as HotkeyId, binding),
  );
  return claimed ? "" : def.defaultBinding;
}

export function formatHotkeyBinding(id: HotkeyId, binding: string): string {
  if (!digitGroup(id)) return formatBindingForDisplay(binding);
  if (!binding || binding === DIGIT_GROUP_OFF) return "";
  const range = id === "globalRoomDigits" ? "1-9" : "0-9";
  return binding === NO_MODIFIER ? range : `${formatBindingForDisplay(binding)} + ${range}`;
}

export function formatBindingForDisplay(binding: string): string {
  return binding
    .split("+")
    .map((p) => {
      if (p === "ctrl") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "alt") return "Alt";
      if (p === "meta") return "⌘";
      if (p === " ") return "Space";
      if (p === "ArrowUp") return "↑";
      if (p === "ArrowDown") return "↓";
      if (p === "ArrowLeft") return "←";
      if (p === "ArrowRight") return "→";
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join(" + ");
}

export function findHotkeyMatch(
  e: KeyboardEvent,
  overrides: Record<string, string>,
  scope: HotkeyScope,
): HotkeyId | null {
  const binding = eventToBinding(e);
  for (const def of HOTKEYS) {
    if (def.scope !== scope) continue;
    if (effectiveBinding(def.id, overrides) === binding) return def.id;
  }
  return null;
}
