import { useEffect, useLayoutEffect, useRef, useState } from "react";

const FOLLOW_IDLE_MS = 1200;

function clamp(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, n));
}

export function useLocalPager(chapterId: string, total: number, snapshotPage: number) {
  const [page, setPageRaw] = useState(() => clamp(snapshotPage, total));
  const [seen, setSeen] = useState(chapterId);
  const lastLocal = useRef(0);
  const pageRef = useRef(page);
  useLayoutEffect(() => {
    pageRef.current = page;
  }, [page]);

  if (seen !== chapterId) {
    setSeen(chapterId);
    setPageRaw(clamp(snapshotPage, total));
  }
  useLayoutEffect(() => {
    lastLocal.current = 0;
  }, [chapterId]);

  const setPage = (n: number) => {
    lastLocal.current = performance.now();
    setPageRaw(clamp(n, total));
  };

  useEffect(() => {
    const target = clamp(snapshotPage, total);
    if (target === pageRef.current) return;
    if (performance.now() - lastLocal.current < FOLLOW_IDLE_MS) return;
    setPageRaw(target);
  }, [snapshotPage, chapterId, total]);

  return { page, setPage };
}
