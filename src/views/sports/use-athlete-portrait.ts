import { useEffect, useState } from "react";
import {
  athletePortraits,
  publishedPortraitUrl,
  type AthletePortrait,
  type AthletePortraitRequest,
} from "@/lib/sports/athlete-portraits";

/** Flags remain caller-owned; photo lookup never delays scores or resets an existing picture. */
export function useAthletePortrait(request: AthletePortraitRequest, enabled = true) {
  const { path, group, id, name, image = "" } = request;
  const key = `${path}:${group ?? ""}:${id}:${name}`;
  const primary = publishedPortraitUrl(image);
  const resolver = athletePortraits();
  const [state, setState] = useState<{
    key: string;
    portrait: AthletePortrait | null;
    loading: boolean;
  } | null>(null);
  useEffect(() => {
    if (!enabled || primary) return;
    if (resolver.peek({ path, group, id, name }) !== undefined) return;
    const controller = new AbortController();
    void resolver
      .resolve({ path, group, id, name }, controller.signal)
      .then((portrait) => {
        if (!controller.signal.aborted) setState({ key, portrait, loading: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, portrait: null, loading: false });
      });
    return () => controller.abort();
  }, [path, group, id, name, key, enabled, primary, resolver]);
  const cached = resolver.peek(request);
  const current =
    cached !== undefined ? { portrait: cached, loading: false } : state?.key === key ? state : null;
  return {
    image: primary || current?.portrait?.url || "",
    attribution: primary ? null : (current?.portrait ?? null),
    loading: enabled && !primary && (current?.loading ?? true),
  };
}
