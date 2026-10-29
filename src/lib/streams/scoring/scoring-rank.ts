import type { DebridSlug, RankedPicker, ScoredStream, Tier } from "../types";
import { isCached } from "../cached";

const isTheater = (s: ScoredStream) =>
  s.source === "CAM" || s.source === "TS" || s.source === "HDTS" || s.source === "TC";

// Same order and pick as harbor-core rank_and_pick: cached first, then the first non-cinema stream, never a cam by choice.
export function rankAndPick(
  scored: ScoredStream[],
  activeDebrids: DebridSlug[],
  preferAac = false,
  respectAddonOrder = false,
): RankedPicker {
  const pri = (s: ScoredStream) => s.addonPriority ?? Number.MAX_SAFE_INTEGER;
  const ret = (s: ScoredStream) => s.addonReturnIdx ?? Number.MAX_SAFE_INTEGER;
  const ordered = scored
    .slice()
    .sort((a, b) =>
      respectAddonOrder
        ? pri(a) - pri(b) || ret(a) - ret(b) || b.score - a.score
        : b.score - a.score,
    );
  const all = ordered.slice().sort((a, b) => {
    const ac = isCached(a, activeDebrids) ? 1 : 0;
    const bc = isCached(b, activeDebrids) ? 1 : 0;
    return bc - ac;
  });

  const byTier: Partial<Record<Tier, ScoredStream>> = {};
  for (const s of all) {
    if (!byTier[s.tier]) byTier[s.tier] = s;
  }

  const cachedPick = (extra: (s: ScoredStream) => boolean) =>
    all.find((s) => isCached(s, activeDebrids) && !isTheater(s) && extra(s));
  let primary = cachedPick(() => true) ?? all.find((s) => !isTheater(s)) ?? all[0] ?? null;
  if (preferAac && primary && isCached(primary, activeDebrids)) {
    primary = cachedPick((s) => s.audio?.codec === "AAC") ?? primary;
  }

  return { primary, byTier, all };
}
