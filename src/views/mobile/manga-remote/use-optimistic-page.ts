import { useEffect, useState } from "react";
import type { TurnDir } from "./gesture-math";

const REVERT_MS = 700;

type Pending = { target: number; seq: number; dir: TurnDir; chapterId: string };

export function useOptimisticPage(
  pageIndex: number,
  pageCount: number,
  chapterId: string,
  seq: number,
) {
  const [pending, setPending] = useState<Pending | null>(null);

  const pendingReached =
    pending !== null &&
    pending.chapterId === chapterId &&
    seq > pending.seq &&
    (pending.dir === "next" ? pageIndex >= pending.target : pageIndex <= pending.target);
  const activePending =
    pending !== null && pending.chapterId === chapterId && !pendingReached ? pending : null;
  if (pending !== null && activePending === null) {
    setPending(null);
  }

  useEffect(() => {
    if (!activePending) return;
    const id = window.setTimeout(() => setPending(null), REVERT_MS);
    return () => window.clearTimeout(id);
  }, [activePending]);

  const advance = (dir: TurnDir) => {
    setPending((prev) => {
      const current = prev && prev.chapterId === chapterId ? prev : null;
      const base = current ? current.target : pageIndex;
      const max = Math.max(0, pageCount - 1);
      const target = dir === "next" ? Math.min(base + 1, max) : Math.max(base - 1, 0);
      return { target, seq, dir, chapterId };
    });
  };

  const displayPage = activePending ? activePending.target : pageIndex;
  return { displayPage, advance };
}
