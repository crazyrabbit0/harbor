import type { CloudEntry, CloudPage, CloudDownload } from "@/lib/generated/games-sources-ipc";
export type { CloudEntry, CloudPage, CloudDownload };
export type CloudProvider = "rd" | "tb" | "pm";
export type CloudKeys = Partial<Record<CloudProvider | "ad", string>>;
export const CLOUD_PROVIDERS: { id: CloudProvider; name: string }[] = [
  { id: "rd", name: "Real-Debrid" },
  { id: "tb", name: "TorBox" },
  { id: "pm", name: "Premiumize" },
];
export const cloudError = (reason: unknown) => {
  const value = reason instanceof Error ? reason.message : String(reason);
  return /^cloud_[a-z_]+$/.test(value) ? `games.cloud.${value}` : "games.cloud.cloud_network";
};
