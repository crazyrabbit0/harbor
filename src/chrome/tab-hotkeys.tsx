import { useEffect } from "react";
import {
  digitFromEvent,
  effectiveBinding,
  eventToBinding,
  shouldHandleGlobalKeyboardEvent,
} from "@/lib/hotkeys";
import { useSettings } from "@/lib/settings";
import { useViewActions, useViewSelector } from "@/lib/view";
import { applyNavCustomization, useAvailableNavItems } from "./nav-items";
import { usePreviewNavCustomization } from "@/lib/theme-preview";

export function TabHotkeys() {
  const { settings } = useSettings();
  const { setView } = useViewActions();
  const { view, player } = useViewSelector((v) => ({ view: v.view, player: !!v.player }));
  const items = applyNavCustomization(
    useAvailableNavItems(),
    usePreviewNavCustomization(settings.navCustomization),
  );
  const enabled = settings.tabHotkeys !== false && !player;
  const overrides = settings.hotkeys ?? {};
  const nextKey = effectiveBinding("globalRoomNext", overrides);
  const prevKey = effectiveBinding("globalRoomPrev", overrides);
  const digitKey = effectiveBinding("globalRoomDigits", overrides);
  const order = items
    .map((item) => item.view)
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    if (!enabled) return;
    const views = order.split(",").filter(Boolean);
    if (views.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (!shouldHandleGlobalKeyboardEvent(event)) return;
      const binding = eventToBinding(event);
      const step = binding === nextKey ? 1 : binding === prevKey ? -1 : 0;
      if (step) {
        event.preventDefault();
        const at = views.indexOf(view);
        const next = ((at < 0 ? 0 : at + step) + views.length) % views.length;
        setView(views[next] as Parameters<typeof setView>[0]);
        return;
      }
      const slot = digitFromEvent(event, digitKey);
      if (slot == null || slot < 1) return;
      const target = views[slot - 1];
      if (!target) return;
      event.preventDefault();
      setView(target as Parameters<typeof setView>[0]);
    };
    // Capture, because the webview claims Ctrl+Tab before a bubble listener sees it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, order, view, setView, nextKey, prevKey, digitKey]);
  return null;
}
