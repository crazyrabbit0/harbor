import { archiveError, type ArchiveJob } from "./archives";

import type {
  CleanupFile,
  CleanupBlocker,
  CleanupReview,
  CleanupRecord,
} from "@/lib/generated/games-ipc";
export type { CleanupFile, CleanupBlocker, CleanupReview, CleanupRecord };

export function cleanupPending(record: CleanupRecord) {
  return !["complete", "restored", "unconfirmed"].includes(record.phase);
}
export function cleanupLabel(record: CleanupRecord) {
  return `games.cleanup.${cleanupPending(record) ? "recovery" : record.phase}`;
}
export function cleanupError(reason: unknown) {
  const code = reason instanceof Error ? reason.message : String(reason);
  if (/command.*not found|unknown command/i.test(code)) return "games.cleanup.unavailable";
  if (code === "archive_cleanup_incomplete") return "games.cleanup.archive_cleanup_receipt";
  return [
    "archive_cleanup_in_use",
    "archive_cleanup_recovery",
    "archive_cleanup_recycle",
    "archive_cleanup_receipt",
  ].includes(code)
    ? `games.cleanup.${code}`
    : archiveError(reason);
}
export function cleanupItems(jobs: ArchiveJob[], records: CleanupRecord[], profile: string) {
  const latest = new Map<string, CleanupRecord>();
  for (const record of records) {
    if (
      record.profile === profile &&
      record.updatedAt >= (latest.get(record.jobId)?.updatedAt ?? 0)
    )
      latest.set(record.jobId, record);
  }
  const eligible = jobs.filter(
    (job) => job.profile === profile && job.status === "complete" && job.receipt,
  );
  const result: { id: string; name: string; job?: ArchiveJob; record?: CleanupRecord }[] =
    eligible.map((job) => ({
      id: job.id,
      name: job.game?.name ?? job.name,
      job,
      record: latest.get(job.id),
    }));
  for (const record of latest.values()) {
    if (!result.some((item) => item.id === record.jobId))
      result.push({ id: record.jobId, name: record.files[0]?.name ?? record.parent, record });
  }
  return result.sort(
    (a, b) =>
      Number(!!b.record && cleanupPending(b.record)) -
      Number(!!a.record && cleanupPending(a.record)),
  );
}
