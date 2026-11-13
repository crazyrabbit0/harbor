export type Tab = "discover" | "browse" | "installed";

export type ToastInfo = {
  kind: "ok" | "error";
  text: string;
  addon?: { id: string; name: string; logo?: string | null };
};

import { t } from "@/lib/i18n";

export function categoryLabel(key: string): string | undefined {
  switch (key) {
    case "metadata":
      return t("Catalogs & metadata");
    case "streams":
      return t("Streams");
    case "subtitles":
      return t("Subtitles");
    case "anime":
      return t("Anime");
    case "sports":
      return t("Sports");
    case "live-tv":
      return t("Live TV");
    case "tools":
      return t("Tools");
    case "adult":
      return t("Adult");
    default:
      return undefined;
  }
}

let pendingAddonsTab: Tab | null = null;

export function requestAddonsTab(tab: Tab): void {
  pendingAddonsTab = tab;
}

export function peekAddonsTab(): Tab | null {
  return pendingAddonsTab;
}

export function consumeAddonsTab(): Tab | null {
  const v = pendingAddonsTab;
  pendingAddonsTab = null;
  return v;
}
