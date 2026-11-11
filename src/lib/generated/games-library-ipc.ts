// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type Emulator = { kind: "mgba" | "dolphin" | "ppsspp" | "retroarch", path: string, corePath: string | null, };

export type LocalGame = { path: string, name: string, sizeBytes: number, system: number, format: string, available: boolean, issue: string | null, discs: number, };

export type RomScan = { root: string, games: Array<LocalGame>, skipped: number, limited: boolean, };

export type RunningGame = { path: string, pid: number, startedAt: number, system: number, };

export type EmbeddedRuntime = { installed: boolean, bytes: number, version: string, };

export type EmbeddedSession = { id: string, url: string, };

export type LaunchConfig = { executable: string, workingDirectory: string | null, arguments: Array<string>, mode: "native" | "wine" | "proton", runner: string | null, prefix: string | null, steamDirectory: string | null, };

export type CustomProcess = { profile: string, id: string, sessionId: string, path: string, pid: number, startedAt: number, };

export type CustomExit = { profile: string, id: string, sessionId: string, pid: number, seconds: number, startedAt: number, success: boolean, code: number | null, endedAt: number, };

export type GameShortcuts = { desktop: string | null, startMenu: string | null, };

export type ShortcutProcess = { profile: string, id: string, sessionId: string, pid: number, startedAt: number, };

export type SaveRestoreReceipt = { status: "restored" | "rolledBack" | "recoveryNeeded" | "notRestored" | "keptCurrent", target: string, recoverySnapshotId: string | null, recoveryFolder: string | null, files: number, bytes: number, };

export type BrowserSourceFile = { url: string, name: string, browserTicket: string, };

export type SteamAchievement = { id: string, name: string, description: string, icon: string, lockedIcon: string, hidden: boolean, unlocked: boolean, unlockedAt: number, };

export type SteamAchievements = { steamId: string, appId: number, items: Array<SteamAchievement>, updatedAt: number, };

export type MinecraftChallenge = { flow: string, user_code: string, verification_uri: string, expires_at: number, interval: number, };

export type MinecraftCape = { id: string, url: string, name: string, active: boolean, };

export type MinecraftProfile = { id: string, name: string, skins: Array<MinecraftSkin>, capes: Array<MinecraftCape>, };

export type MinecraftSkin = { id: string, url: string, variant: "classic" | "slim", active: boolean, };

export type MinecraftAccountStatus = { configured: boolean, account: MinecraftProfile | null, updated_at: number | null, };

export type MinecraftLoaderRelease = { version: string, stable: boolean, };
