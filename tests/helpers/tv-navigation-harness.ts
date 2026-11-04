import * as poster from "../../src/lib/poster-backdrop-expansion.ts";
import { hookHarness, loadModule } from "./hook-harness.ts";
import { tvDom } from "./tv-dom.ts";

// Runs the real keyboard-navigation.ts on a tvDom page; `backs` records the onBack calls.
export function tvNavigationHarness(
  html: string,
  options: { rtl?: boolean; onBack?: () => boolean } = {},
) {
  const dom = tvDom(html, options);
  const hotkeys = loadModule(
    "src/lib/hotkeys.ts",
    { "./stored-settings": { storedSettings: () => ({}) } },
    { document: dom.document },
  );
  const backs: string[] = [];
  const h = hookHarness(
    "src/lib/keyboard-navigation.ts",
    "useKeyboardNavigation",
    {
      "@/lib/hotkeys": hotkeys,
      "@/lib/sfx": { SFX: { close() {}, open() {}, navigate() {} } },
      "@/lib/modal-overlay": { isModalOverlayOpen: () => false, modalOverlayClose: async () => {} },
      "@/lib/poster-backdrop-expansion": poster,
      "./keyboard-navigation/geometry": { navOwnsFocus: () => false },
    },
    dom.globals,
  );
  const onBack = options.onBack ?? (() => (backs.push("back"), true));
  return {
    ...dom,
    h,
    api: h.exports,
    backs,
    mount: () => h.render({ onBack }),
    activeId: (): string | null => dom.document.activeElement.getAttribute("id"),
  };
}
