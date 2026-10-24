import { setItemWithRecovery } from "@/lib/storage-recovery";

const FIND_KEY = "harbor.tmdb.find.v1";
const FIND_MAX = 600;
let findMap: Record<string, string> | null = null;
let findTimer: ReturnType<typeof setTimeout> | null = null;

function findCache(): Record<string, string> {
  if (findMap) return findMap;
  try {
    findMap = JSON.parse(localStorage.getItem(FIND_KEY) ?? "{}") as Record<string, string>;
  } catch {
    findMap = {};
  }
  return findMap;
}

/** `tt…:movie|series` → `movie:<id>` or `tv:<id>`. */
export function cachedTmdbFind(key: string): string | undefined {
  return findCache()[key];
}

export function rememberTmdbFind(key: string, value: string): void {
  const map = findCache();
  map[key] = value;
  const keys = Object.keys(map);
  if (keys.length > FIND_MAX) for (const k of keys.slice(0, keys.length - FIND_MAX)) delete map[k];
  if (findTimer != null) return;
  findTimer = setTimeout(() => {
    findTimer = null;
    try {
      setItemWithRecovery(FIND_KEY, JSON.stringify(findMap ?? {}));
    } catch {
      return;
    }
  }, 3000);
}
