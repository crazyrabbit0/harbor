import type {
  CloudPmJob,
  CloudPmPage,
  CloudWebJob as TorBoxJob,
  CloudWebPage as TorBoxPage,
} from "@/lib/generated/games-sources-ipc";
/** TorBox (`games_cloud_web_*`) and Premiumize (`games_cloud_pm_*`) jobs share one view; only Premiumize sends createdAt. */
export type CloudWebJob = TorBoxJob | CloudPmJob;
export type CloudWebPage = TorBoxPage | CloudPmPage;
export type WebIntent = {
  version: 1;
  url: string;
  title: string;
  remoteId: string | null;
  createdAt: number;
  requestId?: string;
  file?: { name: string; expectedBytes: number | null };
};
export function webIntent(value: unknown): WebIntent | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object") throw Error("web_storage");
  const v = value as WebIntent;
  if (
    v.version !== 1 ||
    typeof v.url !== "string" ||
    v.url.length > 16384 ||
    typeof v.title !== "string" ||
    v.title.length > 500 ||
    !Number.isFinite(v.createdAt) ||
    (v.remoteId !== null &&
      (typeof v.remoteId !== "string" ||
        !/^[a-zA-Z0-9_.:-]{1,128}$/.test(v.remoteId) ||
        v.remoteId === "." ||
        v.remoteId === ".."))
  )
    throw Error("web_storage");
  try {
    const url = new URL(v.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error();
  } catch {
    throw Error("web_storage");
  }
  if (
    v.requestId !== undefined &&
    (typeof v.requestId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(v.requestId))
  )
    throw Error("web_storage");
  if (
    v.file !== undefined &&
    (!v.file ||
      typeof v.file.name !== "string" ||
      !v.file.name.trim() ||
      v.file.name.length > 1000 ||
      /[\x00-\x1f\x7f/\\]/.test(v.file.name) ||
      [".", ".."].includes(v.file.name) ||
      (v.file.expectedBytes !== null &&
        (!Number.isSafeInteger(v.file.expectedBytes) ||
          v.file.expectedBytes <= 0 ||
          v.file.expectedBytes > 16 * 1024 ** 4)))
  )
    throw Error("web_storage");
  return {
    version: 1,
    url: v.url,
    title: v.title,
    remoteId: v.remoteId,
    createdAt: v.createdAt,
    ...(v.requestId ? { requestId: v.requestId } : {}),
    ...(v.file ? { file: { name: v.file.name, expectedBytes: v.file.expectedBytes } } : {}),
  };
}
export async function webIntentKey(
  profile: string,
  key: string,
  url: string,
  provider: "tb" | "pm" | "ad" = "tb",
) {
  // Keep the original TorBox storage identity so existing jobs survive this addition.
  const identity =
    provider === "tb" ? [profile, key.trim(), url] : [provider, profile, key.trim(), url];
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
