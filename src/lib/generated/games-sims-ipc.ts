// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type SimsFile = { path: string, bytes: number, kind: "package" | "script" | "settings", scriptTooDeep: boolean, };

export type SimsFolder = { path: string, gameVersion: string, modsEnabled: boolean | null, scriptsEnabled: boolean | null, resourceReady: boolean, files: Array<SimsFile>, partial: boolean, saveRecovery: boolean, };

export type SaveSnapshotInfo = { id: string, gameName: string, label: string, createdAt: number, sourcePath: string, kind: "manual" | "beforeRestore", fileCount: number, bytes: number, };

export type SimsBackup = { id: string, group: SimsGroup, createdAt: number, };

export type SimsCreatorSource = { provider: "mccc" | "lot51" | "mts", project?: string, requiredCore?: string, version: string, gamePatch: string, archiveHash: string, };

export type SimsGroup = { source?: SimsCreatorSource, id: string, title: string, enabled: boolean, files: Array<SimsStamp>, installedAt: number, gameVersion: string, };

export type SimsKeptFile = { id: string, title: string, path: string, createdAt: number, };

export type SimsSetMember = { id: string, title: string, enabled: boolean, };

export type SimsStamp = { name: string, bytes: number, hash: string, };

export type SimsState = { schema: number, root: string, revision: string, groups: Array<SimsGroup>, backups: Array<SimsBackup>, troubleshoot?: SimsTroubleshootSession, };

export type SimsTrayItem = { id: string, title: string, category: "lot" | "room" | "household", files: Array<SimsStamp>, installed: boolean, installedAt: number, ccGroup: string | null, source?: SimsCreatorSource, };

export type SimsTrayView = { items: Array<SimsTrayItem>, };

export type SimsTroubleshootPhase = "baseline" | "test" | "suspect" | "inconclusive";

export type SimsTroubleshootSession = { id: string, version: string, initial: Array<SimsSetMember>, selected: Array<string>, answers: Array<boolean>, };

export type SimsTroubleshooting = { id: string, round: number, phase: SimsTroubleshootPhase, selected: Array<SimsSetMember>, testing: Array<string>, remaining: number, fixedEnabled: number, versionChanged: boolean, };

export type SimsWorkspace = { tray: SimsTrayView, folder: SimsFolder, state: SimsState, recoveryNeeded: boolean, keptFiles: Array<SimsKeptFile>, saveBackup: SaveSnapshotInfo | null, troubleshooting: SimsTroubleshooting | null, };

export type SimsAction = { "kind": "trayImport", title: string, } | { "kind": "trayRemove", id: string, } | { "kind": "trayRestore", id: string, } | { "kind": "startTest", groups: Array<string>, backupFolder: string | null, } | { "kind": "answerTest", id: string, round: number, present: boolean, } | { "kind": "restoreTest", id: string, } | { "kind": "adopt", title: string, } | { "kind": "install", title: string, } | { "kind": "update", id: string, } | { "kind": "enable", id: string, } | { "kind": "disable", id: string, } | { "kind": "remove", id: string, } | { "kind": "restore", backup: string, } | { "kind": "applySet", id: string, backupFolder: string | null, };

export type SimsChange = { id: string, title: string, enabled: boolean, fileCount: number, bytes: number, };

export type SimsManifest = { name: string, description: string | null, version: string | null, creators: Array<string>, url: string | null, requiredPacks: Array<string>, incompatiblePacks: Array<string>, requirements: Array<SimsManifestRequirement>, };

export type SimsManifestRequirement = { name: string, version: string | null, creators: Array<string>, url: string | null, features: Array<string>, conditional: boolean, };

export type SimsMetadataFile = { file: string, manifests: Array<SimsManifest>, };

export type SimsMetadataReport = { files: Array<SimsMetadataFile>, checkedFiles: number, partial: boolean, };

export type SimsReview = { source: SimsCreatorSource | null, token: string, action: SimsAction, title: string, folder: string, gameVersion: string, files: Array<SimsStamp>, skipped: Array<string>, bytes: number, expiresAt: number, changes: Array<SimsChange>, backupFolder: string | null, sourceFolder: string | null, destinationFolder: string | null, preview: string | null, information: SimsMetadataReport | null, };

export type SimsModSet = { id: string, title: string, members: Array<SimsSetMember>, updatedAt: number, };

export type SimsDependency = { file: string, modName: string, name: string, version: string | null, url: string | null, status: SimsDependencyStatus, matchedFiles: Array<string>, };

export type SimsDependencyStatus = "found" | "missing" | "unchecked" | "notRequired" | "alternative";

export type SimsLaunchSettings = { source: "steam" | "ea" | "custom" | null, state: "checked" | "unknown" | "conflicting", disabled: Array<string>, };

export type SimsPack = { code: string, status: SimsPackStatus, files: Array<string>, };

export type SimsPackReport = { path: string, packs: Array<SimsPack>, partial: boolean, checkedAt: number, launch: SimsLaunchSettings, };

export type SimsPackStatus = "found" | "unchecked";

export type SimsDependencies = { requirements: Array<SimsDependency>, checkedFiles: number, manifestFiles: number, partial: boolean, checkedAt: number, packs: SimsPackReport | null, packError: string | null, };

export type SimsDuplicateCopy = { path: string, groupId: string | null, groupTitle: string | null, };

export type SimsDuplicateMatch = { bytes: number, copies: Array<SimsDuplicateCopy>, };

export type SimsDuplicates = { matches: Array<SimsDuplicateMatch>, checkedFiles: number, skippedFiles: number, partial: boolean, checkedAt: number, };

export type SimsContentArea = "mods" | "disabled" | "game";

export type SimsContentMatch = { path: string, area: SimsContentArea, title: string | null, pack: string | null, packAvailable: boolean | null, references: number, sims: Array<string>, ambiguous: boolean, };

export type SimsContentSim = { id: string, name: string, };

export type SimsContentReport = { sims: Array<SimsContentSim>, objects: number | null, matches: Array<SimsContentMatch>, references: number, unresolved: number, checkedFiles: number, indexedResources: number, partial: boolean, otherData: boolean, modsEnabled: boolean | null, resourceReady: boolean, game: SimsPackReport | null, gameError: string | null, checkedAt: number, };

export type SimsCreatorRelease = { version: string, gamePatch: string, changelog: string, };

export type SimsCreatorCatalog = { releases: Array<SimsCreatorRelease>, observedAt: number, };

export type SimsLot51Project = { slug: string, title: string, subtitle: string, version: string, icon: string, image: string, page: string, };

export type SimsLot51Catalog = { projects: Array<SimsLot51Project>, observedAt: number, cached: boolean, };

export type SimsLot51Detail = { project: SimsLot51Project, description: string, packs: Array<string>, requiredCore: string | null, changelog: string, };

export type SimsCreatorContent = { listed: boolean, partial: boolean, items: Array<SimsCreatorItem>, notes: SimsCreatorNotes, };

export type SimsCreatorItem = { title: string, creator: string, page: string | null, project: string | null, included: boolean | null, };

export type SimsCreatorNotes = { partial: boolean, items: Array<SimsCreatorItem>, };

export type SimsMtsFile = { version: string, name: string, supported: boolean, };

export type SimsMtsMetrics = { rounded?: Partial<Record<"downloads" | "favorites" | "comments" | "views", string>>, downloads?: number, favorites?: number, comments?: number, thanks?: number, views?: number, };

export type SimsMtsDetail = { metrics: SimsMtsMetrics, game: 2 | 3 | 4, project: string, title: string, creator: string, description: string, body: string, gallery: Array<string>, image: string, page: string, packs: Array<string>, files: Array<SimsMtsFile>, content: SimsCreatorContent, };

export type SimsMtsProject = { metrics: SimsMtsMetrics, picked: boolean, game: 2 | 3 | 4, id: string, title: string, creator: string, image: string, page: string, description: string, category: string, updated: string, };

export type SimsMtsQuery = { game: 2 | 3 | 4, category: number, sort: number, query: string, page: number, };

export type SimsMtsPage = { query: SimsMtsQuery, projects: Array<SimsMtsProject>, next: boolean, total: number | null, url: string, observedAt: number, stale: boolean, };
