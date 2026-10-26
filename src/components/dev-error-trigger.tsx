import { useEffect } from "react";
import { showHarborError } from "./error-view";
import { effectiveBinding, eventToBinding } from "@/lib/hotkeys";
import { useSettingsSelector } from "@/lib/settings";

export function DevErrorTrigger() {
  const settings = useSettingsSelector((s) => ({ hotkeys: s.hotkeys }));
  const triggerKey = effectiveBinding("globalTestError", settings.hotkeys ?? {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (triggerKey && eventToBinding(e) === triggerKey) {
        e.preventDefault();
        showHarborError({
          code: "404",
          title: "404",
          message:
            "We couldn't find what you were looking for. The wire got snipped: either the page moved, the addon's offline, or something glitched on our end.",
          detail: "Triggered manually from the test error shortcut",
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerKey]);
  return null;
}
