// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type StardewDependency = { id: string, minimum: string | null, required: boolean, };

export type StardewIssue = { path: string, reason: string, };

export type StardewManifest = { id: string, name: string, author: string, description: string, version: string, entryDll: string | null, contentPackFor: string | null, minimumApi: string | null, minimumGame: string | null, dependencies: Array<StardewDependency>, updateKeys: Array<string>, unsupportedKeys: boolean, };

export type StardewMod = { folder: string, manifest: StardewManifest, missingDll: boolean, duplicate: boolean, requirements: Array<StardewRequirement>, };

export type StardewRequirement = { kind: "mod" | "smapi" | "game", id: string, minimum: string | null, required: boolean, status: "present" | "older" | "missing" | "optional" | "unchecked" | "duplicate" | "unusable", installed: string | null, };

export type StardewInventory = { path: string, gameVersion: string | null, smapiVersion: string | null, mods: Array<StardewMod>, issues: Array<StardewIssue>, partial: boolean, };

export type StardewUpdate = { id: string, state: "available" | "noneSuggested" | "unknown", version: string | null, url: string | null, name: string | null, communityNote: string | null, errors: Array<string>, };

export type StardewReport = { inventory: StardewInventory, updates: Array<StardewUpdate>, observedAt: number, };

export type StardewBackup = { token: string, createdAt: number, item: StardewItem, };

export type StardewItem = { id: string, title: string, version: string, folder: string, enabled: boolean, fileCount: number, origin: StardewOrigin | null, };

export type StardewOrigin = { url: string, file: string, sha256: string, };

export type StardewWorkspace = { supported: boolean, pending: boolean, groups: Array<StardewItem>, backups: Array<StardewBackup>, kept: Array<string>, };

export type StardewReview = { token: string, action: "install" | "update" | "enable" | "disable" | "remove" | "restore", before: StardewItem | null, after: StardewItem | null, bytes: number, files: Array<string>, fileCount: number, requirements: Array<StardewRequirement>, };

export type StardewProject = { id: string, name: string, author: string, description: string, url: string, version: string, updated: string, creator: boolean, };

export type StardewCatalog = { projects: Array<StardewProject>, snapshot: string, commit: string, observedAt: number, unavailable: number, stale: boolean, };

export type WowAddon = { folder: string, manifest: WowAddonManifest | null, state: "ready" | "unreadable" | "noManifest" | "ambiguous", missingDependencies: Array<string>, };

export type WowAddonManifest = { file: string, title: string, version: string, author: string, notes: string, interfaces: Array<number>, dependencies: Array<string>, wowiId: number | null, website: string, loadOnDemand: boolean, };

export type WowAddonInventory = { id: string, clientVersion: string | null, addons: Array<WowAddon>, partial: boolean, checkedAt: number, };

export type WowAddonBackup = { token: string, createdAt: number, addon: WowManagedAddon, };

export type WowManagedAddon = { id: number, title: string, version: string, folders: Array<string>, files: number, bytes: number, };

export type WowAddonWorkspace = { id: string, clientVersion: string, revision: string | null, addons: Array<WowManagedAddon>, backups: Array<WowAddonBackup>, recoveryPending: boolean, canAdopt: boolean, };

export type WowAddonFolder = { name: string, action: WowAddonFolderAction, };

export type WowAddonFolderAction = "add" | "keep" | "replace" | "remove";

export type WowAddonReview = { token: string, id: string, addonId: number, title: string, clientVersion: string, fromVersion: string | null, version: string | null, restore: boolean, adopt: boolean, folders: Array<WowAddonFolder>, files: number, bytes: number, backupBytes: number, dependencies: Array<string>, expiresAt: number, };
