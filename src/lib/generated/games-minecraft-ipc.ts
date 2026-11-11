// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type ModBackup = { package: ModPackage, file: string, };

export type ModDependency = { project_id: string | null, version_id: string | null, dependency_type: string, };

export type ModPackage = { project: string, version: string, name: string, number: string, filename: string, url: string, bytes: number, sha512: string, dependencies: Array<ModDependency>, enabled: boolean, };

export type ModWorkspace = { schema: number, owner: string, revision: string, loader: "fabric" | "forge" | "neoforge" | "quilt", gameVersion: string, packages: Array<ModPackage>, backups: Array<ModBackup>, };

export type ModPlan = { token: string, packages: Array<ModPackage>, replaced: Array<ModPackage>, existing: number, optional: number, bytes: number, loader: string, gameVersion: string, };

export type MinecraftExternalFile = { name: string, bytes: number, };

export type MinecraftContentState = { path: string, workspace: ModWorkspace, external: Array<MinecraftExternalFile>, };

export type MinecraftInstance = { schema: number, id: string, owner: string, name: string, gameVersion: string, loader: string, loaderVersion: string, createdAt: number, pack: MinecraftPackSource | null, files: number, bytes: number, };

export type MinecraftPackSource = { name: string, version: string, project: string | null, versionId: string | null, icon: string, };

export type MinecraftInstanceLibrary = { path: string, instances: Array<MinecraftInstance>, unreadable: number, };

export type MinecraftPackFile = { path: string, bytes: number, optional: boolean, };

export type MinecraftPackPlan = { token: string, name: string, version: string, summary: string, gameVersion: string, loader: string, loaderVersion: string, files: Array<MinecraftPackFile>, overrideCount: number, overrideBytes: number, skipped: number, source: MinecraftPackSource | null, };

export type MinecraftPackHistory = { previous: MinecraftInstance | null, };

export type MinecraftJava = { path: string, major: number, version: string, vendor: string, arch: string, managed: boolean, };

export type MinecraftJavaConfig = { java: MinecraftJava, memoryMib: number, };

export type MinecraftJavaState = { required: number | null, configured: MinecraftJavaConfig | null, compatible: boolean, };

export type MinecraftJavaPlan = { token: string, instance: string, major: number, version: string, bytes: number, name: string, };

export type MinecraftLaunchSession = { schema: number, id: string, pid: number, marker: string, startedAt: number, endedAt: number | null, exitCode: number | null, };

export type MinecraftLaunchState = { running: boolean, session: MinecraftLaunchSession | null, log: string | null, };

export type MinecraftRuntimePlan = { token: string, instance: string, game: string, loader: string, loaderVersion: string, java: number, files: number, bytes: number, cachedFiles: number, cachedBytes: number, processors: number, };

export type MinecraftRuntimeState = { installed: boolean, java: number | null, files: number, bytes: number, };

export type MinecraftRecoveryCopy = { key: string, name: string, version: string, gameVersion: string, loader: string, latest: boolean, savedAt: number | null, };

export type MinecraftStorageState = { backups: Array<MinecraftRecoveryCopy>, unreadable: number, };
