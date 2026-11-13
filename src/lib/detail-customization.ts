import { durableSetItem } from "@/lib/durable-store";
export type DetailCustomization = {
  order: string[];
  hidden: string[];
};

const KEY = "harbor.detailLayout";
const EMPTY: DetailCustomization = { order: [], hidden: [] };

export function loadDetailCustomization(): DetailCustomization {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    return {
      order: Array.isArray(p.order) ? p.order : [],
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
    };
  } catch {
    return EMPTY;
  }
}

export function saveDetailCustomization(c: DetailCustomization): void {
  try {
    durableSetItem(KEY, JSON.stringify(c));
  } catch {
    void 0;
  }
}

export function orderedSectionKeys(available: string[], c: DetailCustomization): string[] {
  const set = new Set(available);
  const out: string[] = [];
  for (const k of c.order) {
    if (set.has(k)) out.push(k);
  }
  const seen = new Set(out);
  for (const k of available) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

export function moveSection(
  c: DetailCustomization,
  available: string[],
  key: string,
  delta: -1 | 1,
): DetailCustomization {
  const order = orderedSectionKeys(available, c);
  const i = order.indexOf(key);
  if (i < 0) return c;
  const j = i + delta;
  if (j < 0 || j >= order.length) return c;
  const next = order.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return { ...c, order: next };
}

export function toggleSectionHidden(c: DetailCustomization, key: string): DetailCustomization {
  const has = c.hidden.includes(key);
  return { ...c, hidden: has ? c.hidden.filter((k) => k !== key) : [...c.hidden, key] };
}

export function resetDetailCustomization(): DetailCustomization {
  return { order: [], hidden: [] };
}
