import { invoke } from "@tauri-apps/api/core";
import {
  invalidateMpvSubtitleFpsContext,
  markMpvSubtitleFpsSessionRecreated,
} from "./mpv-properties";
import type { StartupProfile } from "./mpv-config";

// The embedded Windows mpv child that one player leaves running for the next one with the same render config.
type RetainedMpv = {
  configKey: string;
  isLive: boolean;
  startupProfile: StartupProfile;
};

// Module-level on purpose: Rust runs one mpv instance, so every bridge shares the retained session.
let retainedMpv: RetainedMpv | null = null;
let retainedMpvRelease: Promise<void> | null = null;

// A release still running from the previous player must finish before the next load decides whether to reuse it.
export async function waitForRetainedRelease(): Promise<void> {
  if (retainedMpvRelease) await retainedMpvRelease;
}

export function retainedStartupProfile(): StartupProfile | null {
  return retainedMpv?.startupProfile ?? null;
}

// Claims the retained session when its render config and live/VOD kind match; the startup profile may differ.
export function takeRetainedMpv(reuseConfigKey: string, nextIsLive: boolean): boolean {
  if (retainedMpv?.configKey === reuseConfigKey && retainedMpv.isLive === nextIsLive) {
    retainedMpv = null;
    return true;
  }
  return false;
}

export function forgetRetainedMpv(): void {
  retainedMpv = null;
}

// Stops mpv, or on a kept session asks Rust to drop only the media and remembers the session for the next player.
export function releaseOrStopMpv(keep: RetainedMpv | null): void {
  if (!keep) {
    retainedMpv = null;
    markMpvSubtitleFpsSessionRecreated();
    invoke("mpv_stop").catch(() => {});
    return;
  }
  invalidateMpvSubtitleFpsContext();
  const release = invoke<boolean>("mpv_release_media")
    .then(async (kept) => {
      if (kept) {
        retainedMpv = keep;
        return;
      }
      retainedMpv = null;
      markMpvSubtitleFpsSessionRecreated();
      await invoke("mpv_stop").catch(() => {});
    })
    .catch(async () => {
      retainedMpv = null;
      markMpvSubtitleFpsSessionRecreated();
      await invoke("mpv_stop").catch(() => {});
    });
  retainedMpvRelease = release;
  void release.finally(() => {
    if (retainedMpvRelease === release) retainedMpvRelease = null;
  });
}
