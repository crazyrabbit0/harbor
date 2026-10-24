import type HlsType from "hls.js";
import type MpegtsType from "mpegts.js";

// hls.js and mpegts.js only serve the html5 engine and Multiview, so they load on first use instead of with the app.
let hlsMod: Promise<typeof HlsType> | null = null;
let tsMod: Promise<typeof MpegtsType> | null = null;

export function loadHls(): Promise<typeof HlsType> {
  hlsMod ??= import("hls.js").then((m) => m.default);
  return hlsMod;
}

export function loadMpegts(): Promise<typeof MpegtsType> {
  tsMod ??= import("mpegts.js").then((m) => m.default);
  return tsMod;
}
