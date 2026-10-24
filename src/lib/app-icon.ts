import { isTauri } from "@tauri-apps/api/core";
import { osClass } from "@/lib/platform";
import type { Settings } from "@/lib/settings/types";

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

export type ApplyIconResult = { ok: true } | { ok: false; reason: string };

export type AppIconChoice =
  | { kind: "default" }
  | { kind: "preset"; id: string }
  | { kind: "custom" };

export function appIconChoice({
  customAppIcon,
  customAppIconPreset,
}: Pick<Settings, "customAppIcon" | "customAppIconPreset">): AppIconChoice {
  if (customAppIconPreset) return { kind: "preset", id: customAppIconPreset };
  return customAppIcon ? { kind: "custom" } : { kind: "default" };
}

export async function applyAppIcon(dataUrl: string): Promise<ApplyIconResult> {
  if (!isTauri()) return { ok: false, reason: "not running in the desktop app" };
  if (osClass() === "android" || osClass() === "web") {
    return { ok: false, reason: "app icons are only supported on desktop" };
  }
  const bytes = dataUrl ? dataUrlToBytes(dataUrl) : null;
  if (dataUrl && !bytes) return { ok: false, reason: "could not read the icon image" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_app_icon", { imageBytes: bytes ? Array.from(bytes) : null });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[harbor] app icon set_app_icon failed:", reason);
    return { ok: false, reason };
  }
}
