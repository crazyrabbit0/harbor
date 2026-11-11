import { invoke } from "@tauri-apps/api/core";

import type {
  StardewRequirement,
  StardewMod,
  StardewInventory,
  StardewUpdate,
  StardewReport,
  StardewOrigin,
  StardewItem,
  StardewWorkspace,
  StardewReview,
  StardewProject,
  StardewCatalog,
} from "@/lib/generated/games-mod-managers-ipc";
export type {
  StardewRequirement,
  StardewMod,
  StardewInventory,
  StardewUpdate,
  StardewReport,
  StardewOrigin,
  StardewItem,
  StardewWorkspace,
  StardewReview,
  StardewProject,
  StardewCatalog,
};

export type StardewProgress = {
  profile: string;
  operationId: string;
  phase:
    | "scanning"
    | "checking"
    | "preparing"
    | "applying"
    | "recovering"
    | "catalog"
    | "downloading";
  current: number;
  total: number;
};
export const isStardew = (game: { steamId?: number; catalogSteamId?: number }) =>
  game.steamId === 413150 || game.catalogSteamId === 413150;
export const stardewFolders = () => invoke<string[]>("games_stardew_folders");
export const stardewInspect = (profile: string, path: string, operationId: string) =>
  invoke<StardewInventory>("games_stardew_inspect", { profile, path, operationId });
export const stardewUpdates = (profile: string, path: string, operationId: string) =>
  invoke<StardewReport>("games_stardew_updates", { profile, path, operationId });
export const stardewCancel = (profile: string, operationId: string) =>
  invoke<boolean>("games_stardew_cancel", { profile, operationId });
export const stardewAttention = (mod: StardewMod) =>
  mod.duplicate ||
  mod.missingDll ||
  mod.requirements.some(
    (r) => r.required && ["older", "missing", "duplicate", "unusable"].includes(r.status),
  );
export const stardewDisplayPath = (path: string) => path.replace(/^\\\\\?\\/, "");
export function stardewError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  if (code === "stardew_folder" || code === "stardew_mods_missing")
    return "games.stardew.folderError";
  if (code === "stardew_changed") return "games.stardew.changed";
  if (code === "stardew_catalog_network" || code === "stardew_catalog_response")
    return "games.stardew.catalogError";
  if (code === "stardew_rate_limit") return "games.stardew.rateLimit";
  if (code === "stardew_creator_release" || code === "stardew_creator_changed")
    return "games.stardew.creatorError";
  if (code === "stardew_network" || code === "stardew_response")
    return "games.stardew.networkError";
  const manager: Record<string, string> = {
    stardew_running: "running",
    stardew_process: "running",
    stardew_expired: "expired",
    stardew_busy: "busyError",
    stardew_recovery: "recoveryNote",
    stardew_requirements: "requirementsError",
    stardew_dependents: "dependentsError",
    stardew_unmanaged: "unmanagedError",
    stardew_exists: "conflictError",
    stardew_conflict: "conflictError",
    stardew_archive: "archiveError",
    stardew_archive_layout: "archiveError",
    stardew_limit: "archiveError",
    stardew_package: "archiveError",
    stardew_manifest: "archiveError",
    stardew_space: "spaceError",
    stardew_write: "writeError",
    stardew_record: "recordError",
    stardew_partial: "partialError",
    stardew_platform: "platformError",
    stardew_link: "linkError",
    stardew_canceled: "canceled",
    stardew_timeout: "timeoutError",
  };
  return `games.stardew.${manager[code] ?? "readError"}`;
}
const key = (profile: string) => `harbor:stardew-folder:${profile}`;
export function readStardewFolder(profile: string) {
  try {
    return localStorage.getItem(key(profile)) ?? "";
  } catch {
    return "";
  }
}
export function rememberStardewFolder(profile: string, path: string) {
  try {
    localStorage.setItem(key(profile), path);
  } catch {
    /* The current check still works without storage. */
  }
}

export type StardewAction =
  | { kind: "import"; archive: string }
  | { kind: "toggle" | "remove" | "restore"; id: string }
  | { kind: "creator"; project: string };
export const stardewWorkspace = (path: string) =>
  invoke<StardewWorkspace>("games_stardew_workspace", { path });
export const stardewReview = (
  profile: string,
  path: string,
  operationId: string,
  action: StardewAction,
) =>
  action.kind === "creator"
    ? invoke<StardewReview>("games_stardew_creator_review", {
        profile,
        path,
        operationId,
        project: action.project,
      })
    : invoke<StardewReview>("games_stardew_review", { profile, path, operationId, action });
export const stardewApply = (profile: string, token: string, operationId: string) =>
  invoke<StardewWorkspace>("games_stardew_apply", { profile, token, operationId });
export const stardewRecover = (profile: string, path: string, operationId: string) =>
  invoke<StardewWorkspace>("games_stardew_recover", { profile, path, operationId });
export const stardewDiscard = (profile: string, token: string) =>
  invoke<boolean>("games_stardew_discard", { profile, token });
export const stardewCatalog = (profile: string, operationId: string, refresh = false) =>
  invoke<StardewCatalog>("games_stardew_catalog", { profile, operationId, refresh });
