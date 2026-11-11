// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type SteamArtwork = { capsule: string | null, portrait: string | null, libraryHero: string | null, logo: string | null, };

export type SteamInstall = { appId: number, name: string, installPath: string, libraryPath: string, sizeBytes: number, lastPlayed: number, state: "installed" | "updating" | "missing", update: "none" | "queued" | "downloading" | "paused" | "validating" | "repair" | "uninstalling", bytesToDownload: number, bytesDownloaded: number, artwork: SteamArtwork, };

export type SteamLibrary = { path: string, available: boolean, appCount: number, };

export type SteamLibraryScan = { steamFound: boolean, libraries: Array<SteamLibrary>, games: Array<SteamInstall>, warnings: Array<string>, };

export type SteamShortcut = { id: string, accountId: number, appId: number | null, runGameId: string | null, name: string, executable: string, startDirectory: string, launchOptions: string, lastPlayed: number, hidden: boolean, tags: Array<string>, state: "ready" | "missing" | "account" | "local", artwork: SteamShortcutArtwork, iconKey: string | null, };

export type SteamShortcutArtwork = { capsule: string | null, portrait: string | null, hero: string | null, icon: string | null, };

export type SteamShortcutScan = { steamFound: boolean, activeAccountId: number | null, accounts: Array<number>, games: Array<SteamShortcut>, warnings: Array<string>, directLaunch: boolean, };

export type GameLauncher = "battlenet" | "ea" | "ubisoft" | "epic" | "gog" | "riot" | "rockstar" | "rsi" | "bsg" | "itch";

export type LauncherArtwork = { capsule?: string, hero?: string, logo?: string, };

export type LauncherClient = { launcher: GameLauncher, installed: boolean, };

export type LauncherGame = { id: string, launcher: GameLauncher, productId: string, name: string, installPath: string, state: "installed" | "missing" | "incomplete" | "ambiguous", launchMode: "play" | "client" | "direct", installKey?: string, artwork?: LauncherArtwork, catalogSteamId?: number, };

export type LauncherScan = { supported: boolean, clients: Array<LauncherClient>, games: Array<LauncherGame>, warnings: Array<string>, };

export type LauncherActivity = { id: string, seconds: number, lastPlayed: number, };

export type LauncherProcess = { pid: number, created: number, path: string, };

export type LauncherSession = { profile: string, id: string, sessionId: string, state: string, requestedAt: number, startedAt: number, updatedAt: number, elapsedMs: number, root: string, processes: Array<LauncherProcess>, };

export type LauncherSessions = { sessions: Array<LauncherSession>, activity: Array<LauncherActivity>, error: boolean, };

export type LocalAchievement = { id: string, name: string, description: string, icon: string, lockedIcon: string, hidden: boolean, unlocked: boolean, unlockedAt: number, editable: boolean, };

export type LocalAchievementSnapshot = { appId: number, steamId: string, items: Array<LocalAchievement>, updatedAt: number, };

export type LocalAchievementReview = { token: string, snapshot: LocalAchievementSnapshot, expiresIn: number, };

export type LocalAchievementResult = { id: string, requested: boolean, actual: boolean | null, verified: boolean, };

export type LocalAchievementApplied = { snapshot: LocalAchievementSnapshot | null, results: Array<LocalAchievementResult>, confirmed: boolean, error: string | null, };

export type PublicFile = { id: string, name: string, bytes: number | null, sha256: string | null, state: "available" | "review" | "limited" | "restricted" | "missing" | "unknown", speedLimit: number | null, };

export type PublicFiles = { title: string, files: Array<PublicFile>, selectedId: string | null, };

export type PublicDownload = { url: string, name: string, expectedBytes: number | null, expectedSha256: string | null, };
