import { useEffect, useState } from "react";
import { safeFetch } from "@/lib/safe-fetch";
import {
  athleteRecordUrl,
  cachedAthleteRecord,
  isEspnAthleteId,
  parseAthleteRecord,
  rememberAthleteRecord,
} from "@/lib/sports/athlete-record";

export function useAthleteRecord(athleteId: string | undefined, enabled: boolean): string {
  const id = isEspnAthleteId(athleteId) ? athleteId : "";
  const [fetched, setFetched] = useState<{ id: string; record: string } | null>(null);
  const cached = id && enabled ? cachedAthleteRecord(id) : undefined;
  useEffect(() => {
    if (!id || !enabled || cachedAthleteRecord(id) !== undefined) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await safeFetch(athleteRecordUrl(id), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
        });
        if (!response.ok) return;
        const parsed = parseAthleteRecord(await response.json());
        rememberAthleteRecord(id, parsed);
        if (!controller.signal.aborted) setFetched({ id, record: parsed });
      } catch {
        /* A missing record just leaves the name standing on its own. */
      }
    })();
    return () => controller.abort();
  }, [id, enabled]);
  if (!id || !enabled) return "";
  if (cached !== undefined) return cached;
  return fetched?.id === id ? fetched.record : "";
}
