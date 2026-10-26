import { useEffect } from "react";
import { effectiveBinding, eventToBinding, shouldHandleGlobalKeyboardEvent } from "@/lib/hotkeys";
import { useSearch } from "@/lib/search-context";
import { useSettingsSelector } from "@/lib/settings";

export function SearchHotkey() {
  const { setOpen } = useSearch();
  const settings = useSettingsSelector((s) => ({ hotkeys: s.hotkeys }));
  const binding = effectiveBinding("globalSearchFocus", settings.hotkeys ?? {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleGlobalKeyboardEvent(e)) return;
      if (eventToBinding(e) !== binding) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binding, setOpen]);
  return null;
}
