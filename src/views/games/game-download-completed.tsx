import { useState } from "react";
import { useT, useUiLanguage } from "@/lib/i18n";
import { downloadCompletedAt } from "@/lib/games/download-history";
import type { DownloadItem } from "@/lib/games/download-presentation";

export function DownloadCompletedDate({ item }: { item: DownloadItem }) {
  const t = useT(),
    language = useUiLanguage(),
    at = downloadCompletedAt(item),
    [thisYear] = useState(() => new Date().getFullYear());
  if (!at) return null;
  const date = new Date(at),
    formatted = date.toLocaleString(language, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(date.getFullYear() !== thisYear ? { year: "numeric" as const } : {}),
    });
  return (
    <time
      className="games-download-completed-date"
      dateTime={date.toISOString()}
      title={date.toLocaleString(language)}
    >
      {t("games.download.center.completedAt", { date: formatted })}
    </time>
  );
}
