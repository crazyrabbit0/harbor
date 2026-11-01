import type { MonitorInfo } from "@/lib/monitors";
import type { MpvStartArgs } from "@/lib/generated/mpv-ipc";
import { isMacDesktop, isWindowsDesktop } from "@/lib/platform";
import type { PlayerEmbedRect, PlayerSource } from "./bridge";

export type MpvRect = PlayerEmbedRect;

export type MpvOptions = {
  anime4k: boolean;
  hdrToSdr: boolean;
  rtxHdr?: boolean;
  rtxVsr?: boolean;
  embed?: boolean;
  anime4kShaders?: string[];
  d3d11Flip?: boolean;
  macEdr?: boolean;
  renderer?: "gpu-next" | "gpu";
  forceYuv420p?: boolean;
  extraOptions?: string;
  fullDownload?: boolean;
  separateDisplay?: MonitorInfo | null;
  separateCoverTaskbar?: boolean;
  cacheDir?: string;
  getEmbedRect?: () => Promise<MpvRect | null> | MpvRect | null;
};

export const mpvCacheDir = (options: MpvOptions | undefined): string | null =>
  options?.cacheDir?.trim() || null;

export function mpvReuseConfigKey(options: MpvOptions | undefined, hdrToSdr: boolean): string {
  return JSON.stringify({
    anime4k: options?.anime4k === true,
    hdrToSdr,
    rtxHdr: options?.rtxHdr === true,
    rtxVsr: options?.rtxVsr === true,
    embed: options?.embed === true,
    anime4kShaders: options?.anime4kShaders ?? [],
    d3d11Flip: options?.d3d11Flip === true,
    macEdr: options?.macEdr === true,
    renderer: options?.renderer ?? "gpu-next",
    forceYuv420p: options?.forceYuv420p === true,
    extraOptions: options?.extraOptions ?? "",
    fullDownload: options?.fullDownload === true,
    cacheDir: mpvCacheDir(options),
  });
}

export type StartupProfile = "standard" | "high-bitrate";

export type BufferPhase = "startup" | "steady";

export function hasCustomBufferPolicy(extraOptions: string | undefined): boolean {
  return /(?:^|\n)\s*(?:cache(?:-[\w-]+)?|demuxer-(?:max|readahead)[\w-]*|stream-buffer-size)\s*=/im.test(
    extraOptions ?? "",
  );
}

export function defaultVodBufferProperties(
  profile: "standard" | "high-bitrate",
  phase: BufferPhase,
): Array<[string, string]> {
  const highBitrate = profile === "high-bitrate";
  if (phase === "startup") {
    return [
      ["cache-secs", highBitrate ? "45" : "30"],
      ["cache-pause-wait", highBitrate ? "2" : "1"],
      ["demuxer-max-bytes", highBitrate ? "256MiB" : "128MiB"],
      ["demuxer-max-back-bytes", highBitrate ? "64MiB" : "32MiB"],
      ["demuxer-readahead-secs", highBitrate ? "45" : "30"],
      ["stream-buffer-size", highBitrate ? "32MiB" : "16MiB"],
    ];
  }
  return [
    ["cache-secs", "300"],
    ["cache-pause-wait", highBitrate ? "2" : "1"],
    ["demuxer-max-bytes", highBitrate ? "768MiB" : "512MiB"],
    ["demuxer-max-back-bytes", "64MiB"],
    ["demuxer-readahead-secs", "300"],
    ["stream-buffer-size", highBitrate ? "64MiB" : "32MiB"],
  ];
}

// mpv properties for HDR-to-SDR tone mapping, or the passthrough defaults when it is off.
export function hdrToSdrProperties(on: boolean, oled: boolean): Array<[string, string]> {
  const properties: Array<[string, string]> = on
    ? [
        ["tone-mapping", "spline"],
        ["gamut-mapping-mode", "perceptual"],
        ["hdr-compute-peak", "yes"],
        ["hdr-contrast-recovery", "0.30"],
        ["hdr-peak-percentile", "99.995"],
        ["dither-depth", "auto"],
        ["target-trc", "bt.1886"],
        ["target-prim", "bt.709"],
        ["target-contrast", oled ? "inf" : "auto"],
      ]
    : [
        ["tone-mapping", "auto"],
        ["gamut-mapping-mode", "auto"],
        ["hdr-compute-peak", "auto"],
        ["hdr-contrast-recovery", "0"],
        ["hdr-peak-percentile", "0"],
        ["dither-depth", "auto"],
        ["target-trc", "auto"],
        ["target-prim", "auto"],
        ["target-contrast", "auto"],
      ];
  if (isWindowsDesktop() || isMacDesktop()) {
    properties.push(["target-colorspace-hint", "yes"]);
  }
  return properties;
}

// Arguments for the native mpv_start command; subtitles are added after the media starts loading.
export function mpvStartArgs(
  opts: MpvOptions,
  src: PlayerSource,
  hdrToSdr: boolean,
  startupProfile: StartupProfile,
): MpvStartArgs {
  return {
    url: src.url,
    startAtSec: src.startAtSec ?? null,
    subtitles: [],
    anime4k: opts.anime4k,
    hdrToSdr,
    rtxHdr: opts.rtxHdr === true,
    rtxVsr: opts.rtxVsr === true,
    embed: opts.embed === true,
    anime4kShaders: opts.anime4kShaders ?? [],
    d3d11Flip: opts.d3d11Flip === true,
    macEdr: opts.macEdr === true,
    isLive: src.isLive === true,
    fullDownload: opts.fullDownload === true,
    cacheDir: mpvCacheDir(opts),
    startupProfile,
    headers: src.headers ?? null,
    renderer: opts.renderer ?? "gpu-next",
    forceYuv420p: opts.forceYuv420p === true,
    extraOptions: opts.extraOptions || undefined,
    separateDisplay: opts.embed === true ? null : (opts.separateDisplay ?? null),
    separateCoverTaskbar: opts.separateCoverTaskbar ?? true,
  };
}
