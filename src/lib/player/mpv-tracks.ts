import type { SubCue } from "@/lib/subtitles/parser";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";
import type { Chapter, TrackInfo } from "./bridge";

export type ExternalSubtitleMetadata = {
  url: string;
  lang?: string;
  title?: string;
  cues?: SubCue[];
  originalUrl?: string;
  downloadAuth?: SubtitleLoadMetadata["downloadAuth"];
  format?: SubtitleLoadMetadata["format"];
  release?: string;
  provider?: string;
  providerDerived?: boolean;
  fps?: number;
  downloads?: number;
  author?: string;
  uploadedAt?: string;
  rating?: SubtitleLoadMetadata["rating"];
  productionType?: string;
  releaseType?: string;
  hearingImpaired?: boolean;
  forced?: boolean;
  foreignOnly?: boolean;
  machineTranslated?: boolean;
  fromTrusted?: boolean;
  providerMatch?: SubtitleLoadMetadata["providerMatch"];
  timingStatus?: SubtitleLoadMetadata["timingStatus"];
  timingMeasurementStatus?: SubtitleLoadMetadata["timingMeasurementStatus"];
  matchExplanation?: SubtitleLoadMetadata["matchExplanation"];
  prepared?: boolean;
  autoSelectionEligible?: boolean;
  matchScore?: number;
  matchConfidence?: SubtitleLoadMetadata["matchConfidence"];
  matchReasons?: string[];
  subId?: string;
};

// Builds the audio and subtitle track lists from mpv's track-list, joining Harbor's metadata for external subtitle files.
export function parseMpvTrackList(
  list: Array<Record<string, unknown>>,
  secondarySid: string | null,
  urlByExternalFilename: ReadonlyMap<string, ExternalSubtitleMetadata>,
): { audio: TrackInfo[]; subtitles: TrackInfo[] } {
  const audio: TrackInfo[] = [];
  const subs: TrackInfo[] = [];
  for (const t of list) {
    const type = String(t.type ?? "");
    const id = String(t.id ?? "");
    const lang = (t.lang ?? t.language) as string | undefined;
    const title = t.title as string | undefined;
    const codecDesc = (t["codec-desc"] as string | undefined) || (t.codec as string | undefined);
    const channels = t["demux-channels"] as string | undefined;
    const channelCount =
      typeof t["demux-channel-count"] === "number"
        ? (t["demux-channel-count"] as number)
        : undefined;
    const external = t.external === true;
    const externalFilename = t["external-filename"] as string | undefined;
    const forced = t.forced === true;
    const isDefault = t.default === true;
    const hearingImpaired = t["hearing-impaired"] === true;
    const mainSelection =
      typeof t["main-selection"] === "number" ? (t["main-selection"] as number) : null;
    const isSecondary =
      type === "sub" &&
      t.selected === true &&
      (mainSelection === 1 || (mainSelection == null && id === secondarySid));
    const selected = t.selected === true && !isSecondary;
    const codec = codecDesc ? codecDesc.toUpperCase() : undefined;
    const baseLabel = title || lang || `${type} ${id}`;
    const tags: string[] = [];
    if (codec) tags.push(codec);
    if (type === "audio" && channels) tags.push(channels);
    if (forced) tags.push("Forced");
    if (hearingImpaired) tags.push("SDH");
    if (external) tags.push("External");
    const label = tags.length > 0 ? `${baseLabel} · ${tags.join(" · ")}` : baseLabel;
    const extMeta =
      external && externalFilename
        ? urlByExternalFilename.get(externalFilename.replace(/\\/g, "/"))
        : undefined;
    const info: TrackInfo = {
      id,
      label,
      // A prepared file can lose (or mis-detect) the provider's language.
      lang: extMeta?.lang || lang,
      kind: type === "audio" ? "audio" : "subtitle",
      selected,
      codec,
      channels,
      channelCount,
      title: extMeta?.title || title,
      external,
      prepared: extMeta?.prepared,
      autoSelectionEligible: extMeta?.autoSelectionEligible,
      externalFilename,
      forced: forced || extMeta?.forced === true,
      default: isDefault,
      hearingImpaired: hearingImpaired || extMeta?.hearingImpaired === true,
      secondary: isSecondary,
      url: external && externalFilename ? extMeta?.url : undefined,
      originalUrl: extMeta?.originalUrl,
      downloadAuth: extMeta?.downloadAuth,
      format: extMeta?.format,
      release: extMeta?.release,
      provider: extMeta?.provider,
      providerDerived: extMeta?.providerDerived,
      fps: extMeta?.fps,
      downloads: extMeta?.downloads,
      author: extMeta?.author,
      uploadedAt: extMeta?.uploadedAt,
      rating: extMeta?.rating,
      productionType: extMeta?.productionType,
      releaseType: extMeta?.releaseType,
      foreignOnly: extMeta?.foreignOnly,
      machineTranslated: extMeta?.machineTranslated,
      fromTrusted: extMeta?.fromTrusted,
      providerMatch: extMeta?.providerMatch,
      timingStatus: extMeta?.timingStatus,
      timingMeasurementStatus: extMeta?.timingMeasurementStatus,
      matchExplanation: extMeta?.matchExplanation,
      matchScore: extMeta?.matchScore,
      matchConfidence: extMeta?.matchConfidence,
      matchReasons: extMeta?.matchReasons,
      subId: extMeta?.subId,
    };
    if (type === "audio") audio.push(info);
    else if (type === "sub") subs.push(info);
  }
  return { audio, subtitles: subs };
}

export function parseMpvChapterList(list: Array<Record<string, unknown>>): Chapter[] {
  return list
    .map((c) => ({
      title: typeof c.title === "string" ? c.title : "",
      startSec: typeof c.time === "number" ? c.time : 0,
    }))
    .filter((c) => Number.isFinite(c.startSec) && c.startSec >= 0)
    .sort((a, b) => a.startSec - b.startSec);
}
