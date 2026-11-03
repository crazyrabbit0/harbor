import { useEffect, useLayoutEffect, useRef, useState } from "react";
export function usePokemonFeed<T>(
  key: string,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<{ key: string; data?: T; busy: boolean; failed: boolean }>({
    key,
    busy: enabled,
    failed: false,
  });
  const [attempt, setAttempt] = useState(0);
  const settled = useRef<{ key: string; attempt: number; data: T } | null>(null);
  const loader = useRef(load);
  useLayoutEffect(() => {
    loader.current = load;
  }, [load]);
  // The key captures every input used by the request.
  useEffect(() => {
    if (!enabled) return;
    if (settled.current?.key === key && settled.current.attempt === attempt) {
      setState({ key, data: settled.current.data, busy: false, failed: false });
      return;
    }
    const controller = new AbortController();
    setState({ key, busy: true, failed: false });
    void loader.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          settled.current = { key, attempt, data };
          setState({ key, data, busy: false, failed: false });
        }
      },
      () => {
        if (!controller.signal.aborted) setState({ key, busy: false, failed: true });
      },
    );
    return () => controller.abort();
  }, [key, enabled, attempt]);
  return {
    ...(state.key === key
      ? { ...state, busy: enabled && (state.busy || (state.data === undefined && !state.failed)) }
      : { key, busy: enabled, failed: false, data: undefined }),
    retry: () => setAttempt((n) => n + 1),
  };
}
