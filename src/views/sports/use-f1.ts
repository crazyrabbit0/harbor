import { useEffect, useState } from "react";
import { fetchF1, readF1, type F1Response } from "@/lib/sports/f1-data";
export function useF1(path: string) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    path: string;
    retry: number;
    data?: F1Response;
    loading: boolean;
    failed: boolean;
    at: number;
  }>({ path: "", retry: 0, loading: true, failed: false, at: 0 });
  useEffect(() => {
    if (!path) return;
    let active = true;
    void fetchF1(path, retry > 0)
      .then((entry) => {
        if (active)
          setState({ path, retry, data: entry.data, at: entry.at, loading: false, failed: false });
      })
      .catch(() => {
        if (active)
          setState((prior) => {
            const cached = readF1(path);
            return {
              path,
              retry,
              data: prior.path === path ? (prior.data ?? cached?.data) : cached?.data,
              at: prior.path === path ? prior.at || cached?.at || 0 : cached?.at || 0,
              loading: false,
              failed: true,
            };
          });
      });
    return () => {
      active = false;
    };
  }, [path, retry]);
  const hit = path ? readF1(path) : undefined;
  const current =
    state.path === path && state.retry === retry
      ? state
      : {
          data: hit?.data ?? (state.path === path ? state.data : undefined),
          at: hit?.at || (state.path === path ? state.at : 0),
          loading: !!path && !hit,
          failed: false,
        };
  return {
    ...current,
    retry: () => setRetry((n) => n + 1),
  };
}
