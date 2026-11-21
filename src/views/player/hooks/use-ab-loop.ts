import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { getPlaybackPosition, subscribePlaybackClock } from "@/lib/player/playback-clock";

export type AbLoopState = {
  a: number | null;
  b: number | null;
  setA: () => void;
  setB: () => void;
  clear: () => void;
  active: boolean;
};

export function useAbLoop(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  durationSec: number;
  resetKey: string;
}): AbLoopState {
  const { bridgeRef, durationSec, resetKey } = params;
  const [loop, setLoop] = useState<{ resetKey: string; a: number | null; b: number | null }>({
    resetKey,
    a: null,
    b: null,
  });
  if (loop.resetKey !== resetKey) {
    setLoop({ resetKey, a: null, b: null });
  }
  const a = loop.resetKey === resetKey ? loop.a : null;
  const b = loop.resetKey === resetKey ? loop.b : null;
  const positionRef = useRef(getPlaybackPosition());

  useEffect(
    () =>
      subscribePlaybackClock(() => {
        positionRef.current = getPlaybackPosition();
      }),
    [],
  );

  useEffect(() => {
    bridgeRef.current?.setAbLoop(null, null);
  }, [resetKey, bridgeRef]);

  useEffect(() => {
    bridgeRef.current?.setAbLoop(a, b);
  }, [a, b, bridgeRef]);

  useEffect(() => {
    if (a == null || b == null || b <= a) return;
    return subscribePlaybackClock(() => {
      if (getPlaybackPosition() >= b - 0.05) bridgeRef.current?.seek(a);
    });
  }, [a, b, bridgeRef]);

  const setA = useCallback(() => {
    const t = Math.max(0, positionRef.current);
    setLoop((cur) => ({
      resetKey: cur.resetKey,
      a: t,
      b: cur.b != null && cur.b <= t ? null : cur.b,
    }));
  }, []);

  const setB = useCallback(() => {
    const t = Math.max(0, positionRef.current);
    setLoop((cur) => {
      if (cur.a == null || t <= cur.a) return cur;
      return { resetKey: cur.resetKey, a: cur.a, b: t };
    });
  }, []);

  const clear = useCallback(() => {
    setLoop((cur) => ({ resetKey: cur.resetKey, a: null, b: null }));
  }, []);

  void durationSec;

  return { a, b, setA, setB, clear, active: a != null && b != null && b > a };
}
