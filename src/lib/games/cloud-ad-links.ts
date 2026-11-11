import type { WebIntent } from "./cloud-web-jobs";

import type { AdLink, AdStatus } from "@/lib/generated/games-sources-ipc";
export type { AdLink, AdStatus };
export function adIntent(value: WebIntent | null) {
  if (
    value &&
    (!value.requestId ||
      (value.remoteId !== null &&
        (!/^[1-9][0-9]{0,15}$/.test(value.remoteId) ||
          Number(value.remoteId) > Number.MAX_SAFE_INTEGER ||
          !value.file)))
  )
    throw Error("web_storage");
  return value;
}
export const adErrorCode = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);
export const adRejected = (reason: unknown) =>
  [
    "cloud_password",
    "cloud_auth_blocked",
    "cloud_key",
    "cloud_rate_limit",
    "cloud_quota",
    "cloud_unsupported",
    "cloud_missing",
  ].includes(adErrorCode(reason));
export function adError(reason: unknown) {
  const code = adErrorCode(reason);
  const own: Record<string, string> = {
    cloud_password: "passwordRequired",
    cloud_auth_blocked: "blocked",
    cloud_quota: "quota",
    cloud_unsupported: "unsupported",
  };
  return own[code]
    ? `games.sources.ad.${own[code]}`
    : code === "web_storage"
      ? "games.sources.web.storage"
      : null;
}
