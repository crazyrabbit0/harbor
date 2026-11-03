import type { RefObject } from "react";
import { useT } from "@/lib/i18n";

export function DiscoveryFooter({
  feed,
  unavailable,
}: {
  feed: {
    items: unknown[];
    busy: boolean;
    error: string;
    next: string;
    sentinel: RefObject<HTMLDivElement | null>;
    retry: () => void;
    more: () => void;
  };
  unavailable: string;
}) {
  const t = useT();
  const { items, busy, error, next, sentinel, retry, more } = feed;
  return (
    <>
      {busy && (
        <div className="mc-discovery-skeletons" aria-label={t("common.loading")} role="status">
          {Array.from({ length: items.length ? 2 : 5 }, (_, i) => (
            <div key={i}>
              <i />
              <span>
                <i />
                <i />
                <i />
              </span>
            </div>
          ))}
        </div>
      )}
      {!!error && (
        <div className="mc-catalog-error" role="alert">
          <span>{unavailable}</span>
          <button className="games-button" onClick={retry}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {!busy && !error && !items.length && (
        <p className="mc-catalog-empty">{t("games.minecraft.catalog.empty")}</p>
      )}
      <div ref={sentinel} className="mc-discovery-more">
        {!!next && !error && (
          <button className="games-button" disabled={busy} onClick={more}>
            {t("games.minecraft.discovery.loadMore")}
          </button>
        )}
      </div>
    </>
  );
}
