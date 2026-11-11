import type { GameSummary } from "./types";

import type {
  SteamArtwork,
  SteamInstall as WireSteamInstall,
  SteamLibraryScan as WireSteamLibraryScan,
} from "@/lib/generated/games-launchers-ipc";
/** useSteamLibrary drops null artwork paths and converts the rest to asset URLs. */
export type SteamInstall = Omit<WireSteamInstall, "artwork"> & {
  artwork?: { [K in keyof SteamArtwork]?: string };
};
export type SteamLibraryScan = Omit<WireSteamLibraryScan, "games"> & { games: SteamInstall[] };

export const STEAM_UPDATE_STATES = [
  "none",
  "queued",
  "downloading",
  "paused",
  "validating",
  "repair",
  "uninstalling",
] as const;
export type SteamUpdateState = (typeof STEAM_UPDATE_STATES)[number];

export type LibrarySort = "recent" | "name" | "size";

export function installedSummary(game: SteamInstall): GameSummary {
  return {
    id: `steam:${game.appId}`,
    steamId: game.appId,
    name: game.name,
    capsule:
      game.artwork?.capsule ||
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/header.jpg`,
    ...(game.artwork?.portrait ? { portrait: game.artwork.portrait } : {}),
    platforms: [],
  };
}

export function filterInstalled(
  games: SteamInstall[],
  query: string,
  state: string,
  library: string,
  sort: LibrarySort,
): SteamInstall[] {
  const needle = query.trim().toLocaleLowerCase();
  return games
    .filter(
      (game) =>
        (!needle || game.name.toLocaleLowerCase().includes(needle)) &&
        (state === "all" || game.state === state) &&
        (library === "all" || game.libraryPath === library),
    )
    .sort(
      (a, b) =>
        (sort === "recent"
          ? b.lastPlayed - a.lastPlayed
          : sort === "size"
            ? b.sizeBytes - a.sizeBytes
            : 0) || a.name.localeCompare(b.name),
    );
}

export function libraryName(path: string): string {
  return path.replace(/^\\\\\?\\/, "").replace(/[\\/]+$/, "");
}

export function gameSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const unit = bytes >= 1024 ** 3 ? "GB" : "MB";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / (unit === "GB" ? 1024 ** 3 : 1024 ** 2))} ${unit}`;
}
