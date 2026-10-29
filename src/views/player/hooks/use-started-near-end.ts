import { useEffect, useRef } from "react";
import { getPlaybackPosition, subscribePlaybackClock } from "@/lib/player/playback-clock";

const NEAR_END_RATIO = 0.8;

export function useStartedNearEnd(srcUrl: string, status: string, durationSec: number) {
  const startedNearEndRef = useRef(false);
  const capturedRef = useRef(false);
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;
  const statusRef = useRef(status);
  statusRef.current = status;
  // After an in-place source change the old file keeps playing until the new load starts; only measure the new one.
  const loadSeenRef = useRef(true);
  if (status === "loading" || status === "idle") loadSeenRef.current = true;

  useEffect(() => {
    startedNearEndRef.current = false;
    capturedRef.current = false;
    loadSeenRef.current = statusRef.current === "loading" || statusRef.current === "idle";
  }, [srcUrl]);

  useEffect(() => {
    return subscribePlaybackClock(() => {
      if (capturedRef.current) return;
      if (!loadSeenRef.current) return;
      if (statusRef.current !== "playing") return;
      const dur = durationRef.current;
      if (dur <= 0) return;
      const pos = getPlaybackPosition();
      if (pos <= 0) return;
      capturedRef.current = true;
      startedNearEndRef.current = pos / dur >= NEAR_END_RATIO;
    });
  }, []);

  return startedNearEndRef;
}
