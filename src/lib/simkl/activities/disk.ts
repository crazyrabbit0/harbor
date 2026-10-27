import { activeProfileId } from "@/lib/active-profile-id";
import { idbCacheGet, idbCacheSet } from "@/lib/idb-cache";
import { getSession } from "../session";

// A full-library response stays valid until Simkl's activities watermark moves, so it is kept across launches.
export const SIMKL_DISK_PREFIX = "simkl.allitems.v1:";

type Stored = { marker: string; body: unknown };

function key(path: string): string | null {
  const user = getSession()?.username;
  return user ? `${SIMKL_DISK_PREFIX}${activeProfileId()}|${user}|${path}` : null;
}

/** Returns the stored response for `path` when it was saved under the same watermark, else undefined. */
export async function readSimklSnapshot(path: string, marker: string | null): Promise<unknown> {
  const k = key(path);
  if (!k || marker === null) return undefined;
  try {
    const entry = await idbCacheGet(k);
    const stored = entry?.data as Stored | undefined;
    return stored && stored.marker === marker ? stored.body : undefined;
  } catch {
    return undefined;
  }
}

export function writeSimklSnapshot(path: string, marker: string | null, body: unknown): void {
  const k = key(path);
  if (!k || marker === null) return;
  void idbCacheSet(k, { at: Date.now(), data: { marker, body } satisfies Stored }).catch(() => {});
}
