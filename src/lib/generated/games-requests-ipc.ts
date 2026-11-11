// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type HydraImportRequest = { profile: string, session: string, directory: string, };

export type MinecraftCatalogRequest = { kind?: "search" | "project" | "versions" | "version" | "categories" | "games", type?: "modpack" | "mod" | "resourcepack" | "shader", query?: string, loader?: string, game?: string, category?: string, offset?: number, sort?: string, };

export type PublicFilesRequest = { url: string, file?: string, };

export type PublicBatchRequest = { profile: string, session: string, url: string, files: Array<string>, };

export type SimsMtsRequest = { project: string, version: string, target?: string, };

export type SimsLot51Request = { project: string, version: string, target?: string, };

export type SimsCreatorRequest = { version: string, target?: string, };

export type SaveRequest = { profile: string, gameId: string, gameName: string, source: string, vault: string, label: string, operationId: string, };

export type WowAddonReviewRequest = { "action": "install", addonId: number, } | { "action": "adopt", addonId: number, } | { "action": "remove", addonId: number, } | { "action": "restore", backup: string, };

export type CloudRequest = { provider: string, key: string, parent?: string, page?: number, file?: string, };

export type CloudLinkRequest = { provider: string, key: string, url: string, };

export type CloudAdPrepare = { key: string, url: string, password?: string, };

export type CloudAdRequest = { key: string, id: string, };

export type DownloadGame = { id: string, name: string, artwork?: string, logo?: string, sourceName?: string, contentKind?: "game" | "patch" | "mod" | "extra", };

export type StartTorrent = { profile: string, token: string, parent: string, name: string, game?: DownloadGame, selected: Array<number>, downloadBps: number, uploadBps: number, };

export type PreparationDraftArgs = { archive: string, parent: string, name: string, members?: Array<string>, };

export type PreparationEngine = "direct" | "torrent";

export type PreparationTarget = { profile: string, engine: PreparationEngine, downloadId: string, archive: string, members: Array<string>, };

export type PreparationConfigure = { target: PreparationTarget, parent: string, name: string, };

export type NewTransfer = { sourceLink?: string, browserTicket?: string, profile: string, name: string, game?: DownloadGame, url: string, destination: string, expectedBytes?: number, expectedSha256?: string, };

export type TransferBatchFile = { sourceLink?: string, browserTicket?: string, filename: string, name: string, game?: DownloadGame, url: string, expectedBytes?: number, expectedSha256?: string, };

export type NewBatch = { profile: string, directory: string, files: Array<TransferBatchFile>, };

export type TransferRelink = { profile: string, id: string, previousUrl: string, url: string, filename: string, sourceLink?: string, browserTicket?: string, expectedBytes?: number, expectedSha256?: string, };
