import { invoke } from "@tauri-apps/api/core";
import type { AppFeatures } from "@/lib/generated/app-ipc";

// Off-Tauri builds keep every room; a Tauri build reports what it was compiled with.
const ALL: AppFeatures = { games: true, music: true, livetv: true };
let features: AppFeatures = ALL;
let loading: Promise<void> | null = null;

export function appFeatures(): AppFeatures {
  return features;
}

async function readFeatures(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const reported = await invoke<Partial<AppFeatures>>("app_features");
    features = {
      games: reported.games !== false,
      music: reported.music !== false,
      livetv: reported.livetv !== false,
    };
  } catch {
    features = ALL;
  }
}

/** Reads the build's optional subsystems once, before the first render; a binary without the command keeps all. */
export function loadAppFeatures(): Promise<void> {
  loading ??= readFeatures();
  return loading;
}
