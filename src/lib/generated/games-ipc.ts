// Generated from src-tauri/games/src/download_locations.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type SetupLocation = { path: string, label: string, availableBytes: number | null, };

export type SetupLocations = { drives: Array<SetupLocation>, selected: SetupLocation | null, };

export type SetupEngine = "inno";

export type SetupEntry = { id: string, path: string, relativePath: string, bytes: number, kind: SetupKind, engine: SetupEngine | null, };

export type SetupKind = "installer" | "archive" | "torrent" | "game" | "externalArchive" | "rom";

export type SetupPlan = { token: string, root: string, entries: Array<SetupEntry>, truncated: boolean, };

export type SetupActivity = { bytes: number, files: number, truncated: boolean, };

export type SetupProgress = { stage: SetupStage, verification: SetupVerification | null, percent: number | null, phase: string | null, currentFile: string | null, elapsedSeconds: number | null, remainingSeconds: number | null, ioBytesPerSecond: number | null, observedAt: number, canReveal: boolean, canObserve: boolean, };

export type SetupStage = "installing" | "checking";

export type SetupStatus = "running" | "finished" | "failed" | "interrupted" | "external";

export type SetupVerification = { checkedFiles: number, totalFiles: number, badFiles: number, missingFiles: number, };

export type SetupJob = { id: string, profile: string, source: string, installer: string, startedAt: number, updatedAt: number, status: SetupStatus, exitCode: number | null, error: string | null, engine: SetupEngine | null, destination: string | null, activity: SetupActivity | null, progress: SetupProgress | null, gameCandidates: Array<string>, scanTruncated: boolean, rootGameCandidates: Array<string>, rootCandidatesComplete: boolean, reconnectedAt?: number, recovery?: unknown, };

export type PreparationEngine = "direct" | "torrent";

export type PreparationStatus = "waiting" | "queued" | "dispatching" | "started" | "failed" | "disabled";

export type PreparationTarget = { profile: string, engine: PreparationEngine, downloadId: string, archive: string, members: Array<string>, };

export type PreparationChoice = { id: string, target: PreparationTarget, identity: string, parent: string, name: string, status: PreparationStatus, error: string | null, updatedAt: number, };

export type DownloadGame = { id: string, name: string, artwork?: string, logo?: string, sourceName?: string, contentKind?: "game" | "patch" | "mod" | "extra", };

export type TransferStatus = "queued" | "connecting" | "retrying" | "downloading" | "checking" | "pausing" | "paused" | "canceling" | "canceled" | "complete" | "failed";

export type GameTransfer = { batchId?: string, checkingPartial?: number, preparation?: PreparationChoice, sourceLink?: string, sourcePage?: string, id: string, profile: string, name: string, game?: DownloadGame, url: string, destination: string, status: TransferStatus, received: number, total: number | null, expectedBytes: number | null, expectedSha256: string | null, sha256: string | null, validator: string | null, createdAt: number, updatedAt: number, error: string | null, bytesPerSecond: number, diskBytesPerSecond?: number, queueOrder: number, };

export type TransferSettings = { profile: string, bytesPerSecondLimit: number, };

export type GameStorageForecast = { volume: string, availableBytes: number | null, remainingBytes: number, unknownFiles: number, estimatedFiles: number, fileCount: number, otherReservedBytes: number, shortfallBytes: number | null, };

export type TorrentFile = { index: number, path: string, bytes: number, padding: boolean, };

export type TorrentPlan = { token: string, name: string, infoHash: string, totalBytes: number, pieceLength: number, files: Array<TorrentFile>, private: boolean, };

export type TorrentSeedPolicy = { ratioMilli: number, seconds: number, uploadBps: number, };

export type TorrentSeedStatus = "checking" | "seeding" | "stopped" | "limitReached" | "failed";

export type TorrentSharing = { policy: TorrentSeedPolicy, status: TorrentSeedStatus, uploadedBytes: number, elapsedSeconds: number, error: string | null, };

export type TorrentStatus = "queued" | "checking" | "downloading" | "paused" | "complete" | "failed";

export type GameTorrent = { preparation?: PreparationChoice, completedAt?: number, sharing?: TorrentSharing, storageBytes?: number, queueOrder: number, id: string, profile: string, name: string, game?: DownloadGame, infoHash: string, metadataSha: string, destination: string, selected: Array<number>, totalBytes: number, received: number, status: TorrentStatus, downloadBps: number, uploadBps: number, createdAt: number, updatedAt: number, error: string | null, bytesPerSecond: number, diskBytesPerSecond?: number, uploadPerSecond: number, peers: number, seeders?: number, };

export type ArchiveEntry = { path: string, bytes: number, directory: boolean, };

export type ArchivePart = { name: string, bytes: number, sha256: string, };

export type ArchivePlan = { token: string, source: string, archiveBytes: number, expandedBytes: number, fileCount: number, directoryCount: number, sha256: string, entries: Array<ArchiveEntry>, executableCount: number, parts: Array<ArchivePart>, };

export type ArchiveSpace = { volume: string | null, availableBytes: number | null, expandedBytes: number, reservedBytes: number, afterBytes: number | null, shortfallBytes: number | null, };

export type ArchiveJobStatus = "running" | "complete" | "failed" | "canceled" | "interrupted";

export type ArchiveProgress = { profile: string, operationId: string, phase: "checking" | "extracting" | "publishing" | "complete", bytes: number, totalBytes: number, files: number, totalFiles: number, currentFile: string | null, };

export type ArchiveReceipt = { destination: string, source: string, sha256: string, files: number, bytes: number, parts: Array<ArchivePart>, };

export type ArchiveJob = { id: string, profile: string, source: string, originSource: string, name: string, game: DownloadGame | null, destination: string, stage: string | null, status: ArchiveJobStatus, progress: ArchiveProgress | null, receipt: ArchiveReceipt | null, error: string | null, startedAt: number, updatedAt: number, expectedSha256?: string, allowedParts?: Array<string>, expectedParts?: Array<ArchivePart>, };

export type CleanupBlocker = "anotherProfile" | "activeDownload" | "sharing" | "pendingPreparation" | "otherExtraction";

export type CleanupFile = { identity: string, path: string, name: string, bytes: number, sha256: string, };

export type CleanupReview = { token: string | null, jobId: string, revision: number, checkedAt: number, destination: string, files: Array<CleanupFile>, bytes: number, filesVerified: boolean, blockers: Array<CleanupBlocker>, };

export type CleanupPhase = "staging" | "held" | "recycling" | "complete" | "restored" | "unconfirmed";

export type CleanupRecord = { id: string, profile: string, jobId: string, revision: number, destination: string, destinationIdentity: string, parent: string, parentIdentity: string, stage: string, stageIdentity: string | null, files: Array<CleanupFile>, phase: CleanupPhase, restoring: boolean, error: string | null, updatedAt: number, };
