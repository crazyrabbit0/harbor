import { useMemo } from "react";
import { FAVORITES_GROUP_KEY } from "@/lib/iptv/favorites";
import { arabicAwareMatch } from "@/lib/iptv/rtl";
import type { IptvChannel } from "@/lib/iptv/types";

const NO_FAVORITES: ReadonlySet<string> = new Set();

export function useChannelFilter(
  channels: IptvChannel[],
  group: string | null,
  query: string,
  favorites: ReadonlySet<string> = NO_FAVORITES,
): {
  visible: IptvChannel[];
  counts: Map<string, number>;
  favoritesCount: number;
} {
  return useMemo(() => {
    const counts = new Map<string, number>();
    let favoritesCount = 0;
    for (const ch of channels) {
      const key = ch.group ?? "Uncategorized";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (favorites.has(ch.id)) favoritesCount++;
    }
    const q = query.trim().toLowerCase();
    const visible = channels.filter((ch) => {
      if (group === FAVORITES_GROUP_KEY) {
        if (!favorites.has(ch.id)) return false;
      } else if (group && (ch.group ?? "Uncategorized") !== group) {
        return false;
      }
      if (q) {
        const hay = `${ch.name} ${ch.group ?? ""}`;
        if (!arabicAwareMatch(hay, q)) return false;
      }
      return true;
    });
    return { visible, counts, favoritesCount };
  }, [channels, group, query, favorites]);
}
