import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompanionObservation } from "@/lib/games/companion-request";

/** Keep observations on same-key refresh; never show a previous champion's response. */
export function useLeagueFeed<T>(
  key: string,
  enabled: boolean,
  attempt: number,
  load: (signal: AbortSignal, refresh: boolean) => Promise<CompanionObservation<T>>,
) {
  const [state, setState] = useState<{
    key: string;
    attempt: number;
    data: T | null;
    at: number;
    settled: boolean;
    failed: boolean;
  }>({ key, attempt, data: null, at: 0, settled: false, failed: false });
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (enabled && state.key === key && state.attempt === attempt && state.settled) {
      setState((s) => ({ ...s, settled: false, failed: false }));
    }
  }
  const loader = useRef(load);
  useLayoutEffect(() => {
    loader.current = load;
  }, [load]);
  const previous = useRef({ key, attempt });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(),
      refresh = previous.current.key === key && previous.current.attempt !== attempt;
    previous.current = { key, attempt };
    void loader.current(controller.signal, refresh).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({
            key,
            attempt,
            data: result.data,
            at: result.at,
            settled: true,
            failed: false,
          });
      },
      () => {
        if (!controller.signal.aborted)
          setState((s) => ({
            key,
            attempt,
            data: s.key === key ? s.data : null,
            at: s.key === key ? s.at : 0,
            settled: true,
            failed: true,
          }));
      },
    );
    return () => controller.abort();
  }, [key, enabled, attempt]);
  const current = state.key === key && state.attempt === attempt;
  return {
    key,
    data: state.key === key ? state.data : null,
    at: state.key === key ? state.at : 0,
    busy: enabled && (!current || !state.settled),
    failed: current && state.failed,
  };
}
