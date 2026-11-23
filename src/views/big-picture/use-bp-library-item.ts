import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { CLOUD_OK, libraryGetOne, type LibraryItem } from "@/lib/stremio";

// The recency capped Continue Watching list misses anything older than its top
// slice and is keyed on tt ids, so tmdb metas never match. Resolve per title
// the way the desktop detail view does.
export function useBpLibraryItem(metaId: string, imdbId: string | null): LibraryItem | null {
  const { authKey } = useAuth();
  const reqKey =
    authKey && !metaId.startsWith("simkl:") ? `${authKey}\0${metaId}\0${imdbId ?? ""}` : "";
  const [result, setResult] = useState<{ key: string; item: LibraryItem | null }>({
    key: "",
    item: null,
  });

  useEffect(() => {
    if (!authKey || !reqKey) return;
    const candidates: string[] = [];
    if (metaId.startsWith("tt")) candidates.push(metaId);
    if (imdbId?.startsWith("tt") && !candidates.includes(imdbId)) candidates.push(imdbId);
    if (!metaId.startsWith("tt") && CLOUD_OK.test(metaId)) candidates.push(metaId);
    if (candidates.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const cid of candidates) {
        const found = await libraryGetOne(authKey, cid).catch(() => null);
        if (cancelled) return;
        if (found) {
          setResult({ key: reqKey, item: found });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reqKey, authKey, metaId, imdbId]);

  return reqKey && result.key === reqKey ? result.item : null;
}
