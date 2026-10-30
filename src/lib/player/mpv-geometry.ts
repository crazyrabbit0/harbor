import { invoke } from "@tauri-apps/api/core";
import { makeSafeTauriUnlisten } from "@/lib/tauri-unlisten";
import type { PlayerEmbedRect } from "./bridge";

export type GeometryTracker = {
  moveEmbeddedSurface: (rect: PlayerEmbedRect, commit: () => void) => boolean;
  stop: () => void;
};

// Keeps the embedded mpv window on the player's host rect: one native write in flight, the latest bounds queued behind it.
export async function startGeometryTracking(
  host: HTMLElement | null,
  getEmbedRect: () => Promise<PlayerEmbedRect | null> | PlayerEmbedRect | null,
): Promise<GeometryTracker> {
  let lastRect: PlayerEmbedRect | null = null;
  let frame: number | null = null;
  let active = true;
  let inFlight = false;
  let queued = false;
  let force = false;
  let pendingMove: { rect: PlayerEmbedRect; commit: () => void } | null = null;
  const schedule = () => {
    if (!active) return;
    queued = true;
    if (inFlight || frame != null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      void tick();
    });
  };
  const tick = async () => {
    if (!active) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    queued = false;
    const forced = force;
    force = false;
    const move = pendingMove;
    pendingMove = null;
    try {
      const r = move?.rect ?? (await getEmbedRect());
      if (!active || !r) return;
      if (
        !forced &&
        lastRect &&
        lastRect.cssLeft === r.cssLeft &&
        lastRect.cssTop === r.cssTop &&
        lastRect.cssWidth === r.cssWidth &&
        lastRect.cssHeight === r.cssHeight &&
        lastRect.cssViewW === r.cssViewW &&
        lastRect.cssViewH === r.cssViewH
      ) {
        move?.commit();
        return;
      }
      await invoke("mpv_set_geometry", { geom: r });
      if (active) {
        lastRect = r;
        move?.commit();
      }
    } catch {
      lastRect = null;
    } finally {
      inFlight = false;
      if (active && queued) void tick();
    }
  };

  // A trailing debounce never runs during a drag; dock moves send their bounds in the same frame instead.
  const kick = () => {
    void tick();
  };
  const forceRefresh = () => {
    force = true;
    schedule();
  };
  let resizeObserver: ResizeObserver | null = null;
  const tauriUnlisten: Array<() => void> = [];
  const stop = () => {
    active = false;
    queued = false;
    pendingMove = null;
    if (frame != null) window.cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener("resize", kick);
    window.removeEventListener("harbor:mpv-refresh-geom", kick);
    window.removeEventListener("harbor:mpv-force-geom", forceRefresh);
    try {
      resizeObserver?.disconnect();
    } catch {
      /* noop */
    }
    resizeObserver = null;
    for (const u of tauriUnlisten.splice(0)) {
      try {
        u();
      } catch {
        /* noop */
      }
    }
  };
  window.addEventListener("resize", kick);
  window.addEventListener("harbor:mpv-refresh-geom", kick);
  window.addEventListener("harbor:mpv-force-geom", forceRefresh);
  if (host && typeof ResizeObserver !== "undefined") {
    try {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(host);
    } catch {
      /* noop */
    }
  }
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const unResized = await win.onResized(forceRefresh);
    const unMoved = await win.onMoved(forceRefresh);
    if (!active) {
      unResized();
      unMoved();
    } else {
      tauriUnlisten.push(makeSafeTauriUnlisten(unResized), makeSafeTauriUnlisten(unMoved));
    }
  } catch {
    /* noop */
  }
  // A retained Windows mpv child was hidden when the previous player unmounted; reapplying geometry shows it again.
  if (active) await tick();
  return {
    moveEmbeddedSurface: (rect, commit) => {
      if (!active) return false;
      pendingMove = { rect, commit };
      void tick();
      return true;
    },
    stop,
  };
}
