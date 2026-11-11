// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type CloudEntry = { id: string, name: string, kind: "torrent" | "folder" | "file", bytes: number | null, ready: boolean, status: "ready" | "preparing" | "failed", };

export type CloudPage = { entries: Array<CloudEntry>, next: number | null, label: string, };

export type CloudDownload = { url: string, name: string, expectedBytes: number | null, };

export type CloudWebJob = { id: string, name: string, hash: string, status: "preparing" | "ready" | "failed" | "missing", progress: number | null, bytes: number | null, files: Array<CloudEntry>, };

export type CloudWebPage = { jobs: Array<CloudWebJob>, next: number | null, };

export type CloudPmJob = { createdAt: number | null, id: string, name: string, hash: string, status: "preparing" | "ready" | "failed" | "missing", progress: number | null, bytes: number | null, files: Array<CloudEntry>, };

export type CloudPmPage = { jobs: Array<CloudPmJob>, next: number | null, };

export type HostAllowance = { remaining: number | null, limit: number | null, unit: "links" | "bytes", period: "daily" | "weekly" | "monthly" | "current", };

export type HostCheck = { domain: string, name: string, state: "available" | "listed" | "down" | "unsupported" | "queue" | "unknown" | "limited", icon: string | null, note: string | null, allowances: Array<HostAllowance>, maxFileBytes: number | null, costFactor: number | null, limitsUnavailable: boolean, checkedAt: number, };

export type AdLink = { name: string, expectedBytes: number | null, delayedId: string | null, url: string | null, };

export type AdStatus = { status: "preparing" | "ready" | "failed", url: string | null, seconds: number | null, };

export type PatchPlan = { token: string, format: "BPS" | "IPS" | "UPS", sourceName: string, patchName: string, sourceBytes: number, targetBytes: number, sourceSha256: string, patchSha256: string, targetSha256: string, checksumsVerified: boolean, metadata: string, outputName: string, extension: string, };

export type PatchReceipt = { path: string, bytes: number, sha256: string, };

export type PatchDownloadFile = { name: string, path: string, bytes: number, sha256: string, };

export type PatchDownloadLink = { name: string, url: string, };

export type DownloadReview = { files: Array<PatchDownloadFile>, links: Array<PatchDownloadLink>, notes: Array<string>, };
