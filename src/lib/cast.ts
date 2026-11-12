import { invoke } from "@tauri-apps/api/core";
import { appFeatures } from "@/lib/app-features";
import type {
  CastDeviceInfo,
  CastKind,
  CastLoadArgs,
  CastStatus,
  CastSub,
  CastSubStyle,
  TranscodeProfile,
} from "@/lib/generated/cast-ipc";

export type { CastDeviceInfo, CastKind, CastStatus, CastSubStyle, TranscodeProfile };
export type CastSubInfo = CastSub;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function discoverCastDevices(): Promise<CastDeviceInfo[]> {
  if (!isTauri || !appFeatures().cast) return [];
  try {
    return await invoke<CastDeviceInfo[]>("cast_discover");
  } catch (e) {
    console.warn("[cast] discover failed", e);
    return [];
  }
}

export async function castLoad(opts: {
  host: string;
  port: number;
  url: string;
  title?: string;
  poster?: string;
  contentType?: string;
  startTimeSec?: number;
  kind?: CastKind;
  controlUrl?: string | null;
  headers?: Record<string, string>;
  transcode?: boolean;
  profile?: TranscodeProfile;
  subtitle?: CastSubInfo | null;
  subStyle?: CastSubStyle | null;
  /** Extract audio from this exact source; the receiver must confirm progress before LOAD resolves. */
  audioOnly?: boolean;
  /** Embedded audio ordinal in this exact source (FFmpeg 0:a:N), never mpv aid. */
  audioTrackOrdinal?: number;
  audioStartPaused?: boolean;
}): Promise<{ ok: boolean; error: string | null }> {
  if (!isTauri) return { ok: false, error: "Casting requires the desktop build." };
  try {
    const args: CastLoadArgs = {
      host: opts.host,
      port: opts.port,
      url: opts.url,
      title: opts.title ?? null,
      poster: opts.poster ?? null,
      contentType: opts.contentType ?? null,
      startTimeSec: opts.startTimeSec ?? null,
      kind: opts.kind ?? "chromecast",
      controlUrl: opts.controlUrl ?? null,
      headers: opts.headers ?? null,
      transcode: opts.transcode ?? false,
      profile: opts.profile ?? null,
      subtitle: opts.subtitle ?? null,
      subStyle: opts.subStyle ?? null,
      audioOnly: opts.audioOnly ?? false,
      audioTrackOrdinal: opts.audioTrackOrdinal ?? null,
      audioStartPaused: opts.audioStartPaused ?? false,
    };
    await invoke("cast_load", { args });
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function castPlay(): Promise<void> {
  if (!isTauri) return;
  await invoke("cast_play");
}

export async function castPause(): Promise<void> {
  if (!isTauri) return;
  await invoke("cast_pause");
}

export async function castSeek(sec: number): Promise<void> {
  if (!isTauri) return;
  await invoke("cast_seek", { sec });
}

export async function castStop(): Promise<void> {
  if (!isTauri) return;
  await invoke("cast_stop");
}

export async function castStatus(): Promise<CastStatus | null> {
  if (!isTauri) return null;
  return (await invoke<CastStatus | null>("cast_status")) ?? null;
}

let ffmpegPresentCache: boolean | null = null;
export async function isFfmpegPresent(): Promise<boolean> {
  if (!isTauri) return false;
  if (ffmpegPresentCache != null) return ffmpegPresentCache;
  try {
    ffmpegPresentCache = await invoke<boolean>("cast_ffmpeg_present");
  } catch {
    ffmpegPresentCache = false;
  }
  return ffmpegPresentCache;
}

function mimeFromExt(s: string): string | undefined {
  const lower = s.toLowerCase().split("?")[0];
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (lower.endsWith(".mpd")) return "application/dash+xml";
  if (lower.endsWith(".ts")) return "video/mp2t";
  return undefined;
}

export function guessContentType(url: string, fallbackName?: string): string {
  return mimeFromExt(url) ?? (fallbackName ? mimeFromExt(fallbackName) : undefined) ?? "video/mp4";
}
