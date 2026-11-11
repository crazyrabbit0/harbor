import { invoke } from "@tauri-apps/api/core";
import { saveErrorKey } from "./saves";
import type { SimsPackSelection } from "./sims-packs";

import type {
  SimsStamp,
  SimsFile,
  SimsFolder,
  SimsCreatorSource,
  SimsCreatorItem,
  SimsCreatorContent,
  SimsMtsMetrics,
  SimsMtsDetail,
  SimsMtsQuery as WireSimsMtsQuery,
  SimsMtsProject as WireSimsMtsProject,
  SimsMtsPage,
  SimsLot51Project,
  SimsLot51Catalog,
  SimsLot51Detail,
  SimsCreatorRelease,
  SimsCreatorCatalog,
  SimsGroup,
  SimsBackup,
  SimsTroubleshooting,
  SimsTrayItem,
  SimsWorkspace,
  SimsAction,
  SimsReview,
  SimsModSet,
  SimsManifest,
  SimsMetadataReport,
  SimsDependencies,
  SimsDuplicates,
} from "@/lib/generated/games-sims-ipc";
export type {
  SimsStamp,
  SimsFile,
  SimsFolder,
  SimsCreatorSource,
  SimsCreatorItem,
  SimsCreatorContent,
  SimsMtsMetrics,
  SimsMtsDetail,
  SimsMtsQuery as WireSimsMtsQuery,
  SimsMtsProject as WireSimsMtsProject,
  SimsMtsPage,
  SimsLot51Project,
  SimsLot51Catalog,
  SimsLot51Detail,
  SimsCreatorRelease,
  SimsCreatorCatalog,
  SimsGroup,
  SimsBackup,
  SimsTroubleshooting,
  SimsTrayItem,
  SimsWorkspace,
  SimsAction,
  SimsReview,
  SimsModSet,
  SimsManifest,
  SimsMetadataReport,
  SimsDependencies,
  SimsDuplicates,
};
/** Browse input: native code defaults an omitted game to The Sims 4. */
export type SimsMtsQuery = Omit<WireSimsMtsQuery, "game"> & { game?: WireSimsMtsQuery["game"] };
/** CurseForge cards reuse this shape without a picked flag. */
export type SimsMtsProject = Omit<WireSimsMtsProject, "picked"> & { picked?: boolean };

export type SimsProgress = {
  profile: string;
  operationId: string;
  phase: "waiting" | "downloading" | "reviewing" | "checking" | "copying" | "publishing" | "done";
  file: string | null;
  bytes: number;
  totalBytes: number;
  canCancel: boolean;
};
export const simsCreatorName = (source: SimsCreatorSource) =>
  source.provider === "mts"
    ? "Mod The Sims"
    : source.provider === "lot51"
      ? "Lot 51"
      : "Deaderpool";
export const simsMtsDetail = (profile: string, page: string, operationId: string) =>
  invoke<SimsMtsDetail>("games_sims_mts_detail", { profile, page, operationId });
export const simsMtsBrowse = (
  profile: string,
  query: SimsMtsQuery,
  operationId: string,
  refresh = false,
) =>
  invoke<SimsMtsPage>("games_sims_mts_browse", {
    profile,
    query: query.game === 4 ? { ...query, game: undefined } : query,
    operationId,
    refresh,
  });
export const simsLot51Catalog = (refresh = false) =>
  invoke<SimsLot51Catalog>("games_sims_lot51_catalog", { refresh });
export const simsLot51Detail = (project: string) =>
  invoke<SimsLot51Detail>("games_sims_lot51_detail", { project });
export type SimsSetEdit = {
  revision: string;
  previous: SimsModSet | null;
  title: string;
  members: { id: string; enabled: boolean }[];
};
export const simsSets = (profile: string, path: string) =>
  invoke<SimsModSet[]>("games_sims_sets", { profile, path });
export const simsSetSave = (profile: string, path: string, edit: SimsSetEdit) =>
  invoke<SimsModSet[]>("games_sims_set_save", { profile, path, edit });
export const simsSetRemove = (profile: string, path: string, previous: SimsModSet) =>
  invoke<SimsModSet[]>("games_sims_set_remove", { profile, path, previous });
export type SimsInspection = { resources: number; category: string; thumbnail: string | null };
export type SimsMetadataTarget = { kind: "group"; id: string } | { kind: "file"; file: string };
export const simsMetadata = (
  profile: string,
  path: string,
  target: SimsMetadataTarget,
  operationId: string,
) => invoke<SimsMetadataReport>("games_sims_metadata", { profile, path, target, operationId });
export const simsDependencies = (
  profile: string,
  path: string,
  operationId: string,
  installation: SimsPackSelection | null = null,
) =>
  invoke<SimsDependencies>("games_sims_dependencies", { profile, path, operationId, installation });
export const simsDuplicates = (profile: string, path: string, operationId: string) =>
  invoke<SimsDuplicates>("games_sims_duplicates", { profile, path, operationId });
export const isSims4 = (game: { steamId?: number; igdbId?: number }) =>
  game.steamId === 1222670 || game.igdbId === 3212;
export const simsDisplayPath = (path: string) =>
  path.startsWith("\\\\?\\UNC\\")
    ? `\\\\${path.slice(8)}`
    : path.startsWith("\\\\?\\")
      ? path.slice(4)
      : path;
const folderKey = (profile: string) => `harbor.games.sims.folder:${profile}`;
export function readSimsFolder(profile: string) {
  try {
    const value = localStorage.getItem(folderKey(profile));
    return value && value.length <= 4096 ? value : "";
  } catch {
    return "";
  }
}
export function rememberSimsFolder(profile: string, path: string) {
  try {
    localStorage.setItem(folderKey(profile), path);
  } catch {
    /* The current workspace remains usable without persistence. */
  }
}
export const simsFolders = () => invoke<SimsFolder[]>("games_sims_folders");
export const simsWorkspace = (path: string) =>
  invoke<SimsWorkspace>("games_sims_workspace", { path });
export const simsCreatorCatalog = (refresh = false) =>
  invoke<SimsCreatorCatalog>("games_sims_catalog", { refresh });
export const simsCreatorReview = (
  profile: string,
  path: string,
  request: { version: string; target?: string; provider?: "lot51" | "mts"; project?: string },
  operationId: string,
) =>
  request.provider === "lot51" || request.provider === "mts"
    ? invoke<SimsReview>(
        request.provider === "mts" ? "games_sims_mts_review" : "games_sims_lot51_review",
        {
          profile,
          path,
          request: { project: request.project, version: request.version, target: request.target },
          operationId,
        },
      )
    : invoke<SimsReview>("games_sims_creator_review", {
        profile,
        path,
        request: { version: request.version, target: request.target },
        operationId,
      });
export const simsReview = (
  profile: string,
  path: string,
  action: SimsAction,
  sources: string[],
  operationId: string,
) => invoke<SimsReview>("games_sims_review", { profile, path, action, sources, operationId });
export const simsApply = (profile: string, token: string, operationId?: string) =>
  invoke<SimsWorkspace>("games_sims_apply", { profile, token, operationId });
export const simsCancel = (profile: string, operationId: string) =>
  invoke<boolean>("games_sims_cancel", { profile, operationId });
export const simsKeptFolder = (path: string, id: string) =>
  invoke<string>("games_sims_kept_folder", { path, id });
export const simsRecover = (path: string) => invoke<SimsWorkspace>("games_sims_recover", { path });
export const simsDiscard = (profile: string, token: string) =>
  invoke<void>("games_sims_discard", { profile, token }).catch(() => {});
const errors: Record<string, string> = {
  sims_packs_folder: "packsFolderError",
  sims_creator_dependency: "lotDependencyError",
  sims_lot51_target: "lotTargetError",
  sims_mts_page: "mtsPageError",
  sims_mts_zip: "mtsZip",
  sims_mts_browse: "mtsQueryError",
  sims_creator_network: "creatorNetwork",
  sims_creator_format: "creatorNetwork",
  sims_creator_changed: "creatorChanged",
  sims_creator_patch: "creatorPatch",
  sims_creator_target: "creatorTarget",
  sims_creator_existing: "creatorExistingError",
  sims_tray_format: "trayFormat",
  sims_tray_set: "traySet",
  sims_tray_exists: "trayExists",
  sims_test_active: "testActive",
  sims_adopt_folder: "adoptFolder",
  sims_adopt_managed: "adoptManaged",
  sims_adopt_scan: "adoptScan",
  sims_set_missing: "setMissing",
  sims_set_unchanged: "setUnchanged",
  sims_set_scan: "setScan",
  sims_folder: "folderError",
  sims_path: "folderError",
  sims_link: "folderError",
  sims_platform: "desktop",
  sims_read: "readError",
  sims_format: "formatError",
  sims_script: "formatError",
  sims_archive: "formatError",
  sims_archive_layout: "layoutError",
  sims_running: "running",
  sims_process: "running",
  sims_recovery: "recovery",
  sims_title: "nameError",
  sims_duplicate: "duplicate",
  sims_record: "recordError",
  sims_profile: "reviewError",
  sims_request: "reviewError",
};
export function simsError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (value.startsWith("save_")) return saveErrorKey(value);
  if (value === "sims_save_recovery") return "games.backups.save_recovery";
  if (errors[value]) return `games.sims.${errors[value]}`;
  if (
    [
      "sims_canceled",
      "sims_write",
      "sims_changed",
      "sims_exists",
      "sims_missing",
      "sims_busy",
      "sims_limit",
      "sims_expired",
      "sims_space",
    ].includes(value)
  )
    return `games.mods.error.${value.slice(5)}`;
  return "games.sims.desktop";
}

// Reading a thumbnail can decompress package resources. Bound work even for a
// large local gallery and skip requests whose cards have left the page.
let inspecting = 0;
const queue: (() => void)[] = [];
export function simsInspect(
  path: string,
  file: string,
  signal: AbortSignal,
): Promise<SimsInspection> {
  return queuedInspection("games_sims_inspect", { path, file }, signal);
}
export function simsTrayPreview(
  path: string,
  id: string,
  signal: AbortSignal,
): Promise<string | null> {
  return queuedInspection("games_sims_tray_preview", { path, id }, signal);
}
function queuedInspection<T>(
  command: string,
  args: Record<string, string>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        queue.shift()?.();
        return;
      }
      inspecting++;
      void invoke<T>(command, args)
        .then(resolve, reject)
        .finally(() => {
          inspecting--;
          queue.shift()?.();
        });
    };
    if (inspecting < 2) run();
    else queue.push(run);
  });
}
