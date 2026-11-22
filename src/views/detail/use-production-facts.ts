import { useEffect, useSyncExternalStore } from "react";
import {
  fetchProductionFacts,
  productionCached,
  productionKey,
  subscribeProduction,
  type ProductionFacts,
  type ProductionRequest,
} from "@/lib/providers/shotonwhat";

export function useProductionFacts(request: ProductionRequest | null): ProductionFacts | null {
  const key = request ? productionKey(request) : "";
  const title = request?.title ?? "";
  const originalTitle = request?.originalTitle ?? "";
  const year = request?.year ?? "";
  const imdbId = request?.imdbId ?? "";

  const facts = useSyncExternalStore(subscribeProduction, () =>
    key ? productionCached(key) : null,
  );

  useEffect(() => {
    if (!key) return;
    void fetchProductionFacts({
      title,
      originalTitle: originalTitle || undefined,
      year: year || undefined,
      imdbId: imdbId || null,
    });
  }, [key, title, originalTitle, year, imdbId]);

  return facts;
}
