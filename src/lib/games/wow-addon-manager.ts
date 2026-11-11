import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type {
  WowManagedAddon,
  WowAddonWorkspace,
  WowAddonReview,
} from "@/lib/generated/games-mod-managers-ipc";
import type { WowAddonReviewRequest } from "@/lib/generated/games-requests-ipc";
export type { WowManagedAddon, WowAddonWorkspace, WowAddonReview };

export type WowAddonRequest = WowAddonReviewRequest;
export const loadWowAddonWorkspace = (id: string) =>
  invoke<WowAddonWorkspace>("games_wow_addon_workspace", { id });
export const reviewWowAddon = (
  profile: string,
  id: string,
  request: WowAddonRequest,
  operationId: string,
) => invoke<WowAddonReview>("games_wow_addon_review", { profile, id, request, operationId });
export const applyWowAddon = (profile: string, token: string, operationId: string) =>
  invoke<WowAddonWorkspace>("games_wow_addon_apply", { profile, token, operationId });
export const recoverWowAddons = (profile: string, id: string, operationId: string) =>
  invoke<WowAddonWorkspace>("games_wow_addon_recover", { profile, id, operationId });
export const discardWowAddon = (profile: string, token: string) =>
  invoke<void>("games_wow_addon_discard", { profile, token }).catch(() => {});
export const cancelWowAddon = (profile: string, operationId: string) =>
  invoke<void>("games_wow_addon_cancel", { profile, operationId }).catch(() => {});
export const onWowAddonProgress = (
  profile: string,
  callback: (operationId: string, phase: string) => void,
) =>
  listen<{ profile: string; operationId: string; phase: string }>(
    "games:wow-addon-progress",
    ({ payload }) => {
      if (payload.profile === profile) callback(payload.operationId, payload.phase);
    },
  ).catch(() => () => {});

export function wowAddonError(reason: unknown): string {
  const code = String(reason);
  const match = code.match(/wow_addons_([a-z_]+)/)?.[1];
  if (match === "cancelled") return "games.wow.manager.cancelled";
  if (["running", "game_busy", "process"].includes(match ?? ""))
    return "games.wow.manager.errorRunning";
  if (["incompatible", "edition", "version"].includes(match ?? ""))
    return "games.wow.manager.errorCompatibility";
  if (match === "identity" || match === "collision") return "games.wow.manager.errorIdentity";
  if (match === "unmanaged") return "games.wow.manager.errorUnmanaged";
  if (["changed", "linked", "record", "recovery"].includes(match ?? ""))
    return "games.wow.manager.errorChanged";
  if (match === "dependency") return "games.wow.manager.errorDependency";
  if (["expired", "review"].includes(match ?? "")) return "games.wow.manager.errorExpired";
  if (match === "platform" || /not found|not a function|__TAURI|undefined/i.test(code))
    return "games.wow.manager.errorDesktop";
  return "games.wow.manager.error";
}
