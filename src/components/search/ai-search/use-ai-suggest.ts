import { useEffect, useRef, useState } from "react";
import {
  AiSearchError,
  aiSuggest,
  resolveAiSuggestions,
  type AiErrorDescriptor,
  type AiResult,
} from "@/lib/ai-search";
import { useSettings } from "@/lib/settings";
import { aiIsGroq, aiKey } from "@/lib/ai-models";
import { enrichWithContent } from "@/lib/jina-search";

export type AiStatus = "idle" | "loading" | "done" | "error";

export function useAiSuggest(query: string, runSignal = 0) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<AiStatus>("idle");
  const [results, setResults] = useState<AiResult[]>([]);
  const [error, setError] = useState<AiErrorDescriptor | null>(null);
  const [ranQuery, setRanQuery] = useState("");
  const reqRef = useRef(0);

  const [querySeen, setQuerySeen] = useState(query);
  if (querySeen !== query) {
    setQuerySeen(query);
    setStatus("idle");
    setResults([]);
    setError(null);
    setRanQuery("");
  }

  useEffect(() => {
    reqRef.current += 1;
  }, [query]);

  const activeKey = aiKey(settings);

  const run = async () => {
    const id = ++reqRef.current;
    setStatus("loading");
    setError(null);
    setRanQuery(query);
    const webContextFor = (): Promise<string | undefined> =>
      settings.aiWebSearch
        ? enrichWithContent(query, settings.jinaKey).then(
            ({ context }) => context || undefined,
            () => undefined,
          )
        : Promise.resolve(undefined);
    try {
      const webContext = await webContextFor();
      const suggestions = await aiSuggest(
        activeKey,
        settings.aiSearchModel,
        aiIsGroq(settings),
        query,
        webContext,
      );
      if (id !== reqRef.current) return;
      if (suggestions.length === 0) {
        setResults([]);
        setStatus("done");
        return;
      }
      const metas = await resolveAiSuggestions(suggestions);
      if (id !== reqRef.current) return;
      setResults(metas);
      setStatus("done");
    } catch (e) {
      if (id !== reqRef.current) return;
      if (e instanceof AiSearchError) {
        setError({
          messageKey: e.messageKey,
          ...(e.values ? { values: e.values } : {}),
          ...(e.detail ? { detail: e.detail } : {}),
        });
      } else {
        const detail = e instanceof Error ? e.message : typeof e === "string" ? e : undefined;
        setError({
          messageKey: "AI search failed.",
          ...(detail ? { detail } : {}),
        });
      }
      setStatus("error");
    }
  };

  // Only a new run signal starts a request; query and key changes alone never do.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  const startRef = useRef({ query, activeKey });
  useEffect(() => {
    startRef.current = { query, activeKey };
  });
  useEffect(() => {
    const { query: q, activeKey: key } = startRef.current;
    if (!runSignal || !q.trim() || !key.trim()) return;
    void runRef.current();
  }, [runSignal]);

  return { status, results, error, ranQuery, run };
}
