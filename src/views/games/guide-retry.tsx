import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";

export function GuideRetry({ retryAt = 0, onRetry }: { retryAt?: number; onRetry: () => void }) {
  const t = useT(),
    now = useNow(1000, retryAt > 0);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
    <div className="games-guide-retry">
      <button
        className="games-button games-button-primary"
        disabled={seconds > 0}
        onClick={onRetry}
      >
        <RefreshCw size={17} />
        {t("common.retry")}
      </button>
      {seconds > 0 && <p>{t("games.guides.rateLimit", { seconds })}</p>}
    </div>
  );
}
