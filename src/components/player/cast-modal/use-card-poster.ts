import type { Meta } from "@/lib/cinemeta";
import { usePosterChain } from "@/components/poster";
import { useSettingsSelector } from "@/lib/settings";

export function useCardPoster(meta: Meta) {
  const settings = useSettingsSelector((s) => ({ rpdbKey: s.rpdbKey }));
  return usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
}
