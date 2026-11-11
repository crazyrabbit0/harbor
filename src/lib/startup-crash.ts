import type { HarborError } from "@/components/error-view";
import type { StartupCrashReport } from "@/lib/generated/crash-report-ipc";

export type { StartupCrashReport };

let startupReportPromise: Promise<StartupCrashReport | null> | null = null;

export function loadStartupCrashReport(): Promise<StartupCrashReport | null> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve(null);
  startupReportPromise ??= import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<StartupCrashReport | null>("take_startup_crash_report"))
    .catch(() => null);
  return startupReportPromise;
}

export function startupCrashToHarborError(report: StartupCrashReport): HarborError {
  return {
    code: "NativePanic",
    title: "Previous native crash",
    message:
      "Sorry — Harbor crashed the last time it was running. You can review the details and choose whether to send a report.",
    detail: [
      `Version: ${report.version}`,
      `Platform: ${report.platform}`,
      report.message ? `Message: ${report.message}` : "",
      report.location ? `Location: ${report.location}` : "",
      report.backtrace ? `Backtrace:\n${report.backtrace}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    fatal: false,
  };
}
