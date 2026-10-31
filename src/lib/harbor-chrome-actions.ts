import type { View } from "./view";

export type HarborAction =
  | { action: "navigate"; view: View }
  | { action: "back" }
  | { action: "search" }
  | { action: "settings" };

/** The slice of Element the dispatcher reads; a real Element satisfies it. */
export type ActionSource = {
  getAttribute(name: string): string | null;
  closest(selector: string): ActionSource | null;
};

// Record<View, true> makes the compiler flag a new View that is missing here.
const NAV_VIEWS: Record<View, true> = {
  home: true,
  settings: true,
  anime: true,
  discover: true,
  catalogs: true,
  plugins: true,
  addons: true,
  calendar: true,
  movies: true,
  shows: true,
  music: true,
  games: true,
  kids: true,
  library: true,
  "collections-hub": true,
  live: true,
  sports: true,
  vod: true,
  downloads: true,
  wrapped: true,
  manga: true,
  ebook: true,
  people: true,
};

const NAV_VIEW_IDS: ReadonlySet<string> = new Set(Object.keys(NAV_VIEWS));

// Native chrome owns its [data-harbor-nav] clicks; only theme-authored chrome navigates declaratively.
const CUSTOM_CHROME = "#harbor-custom-overlay, #harbor-studio-preview-html";

export const HARBOR_ACTION_SELECTOR = "[data-harbor-action], [data-harbor-nav]";

/** setView treats unknown ids as Settings, so every navigate target is checked first. */
export function isHarborNavView(value: string): value is View {
  return NAV_VIEW_IDS.has(value);
}

function fromActionElement(el: ActionSource): HarborAction | null {
  const action = el.getAttribute("data-harbor-action");
  switch (action) {
    case "navigate": {
      const view = el.getAttribute("data-harbor-arg")?.trim() ?? "";
      return isHarborNavView(view) ? { action: "navigate", view } : null;
    }
    case "back":
      return { action: "back" };
    case "search":
      return { action: "search" };
    case "settings":
      return { action: "settings" };
    default:
      return null;
  }
}

/** Resolves a clicked element to an allowlisted app action, or null when none applies. */
export function harborActionFor(target: ActionSource | null): HarborAction | null {
  if (!target) return null;
  const actionEl = target.closest("[data-harbor-action]");
  if (actionEl) return fromActionElement(actionEl);
  const navEl = target.closest("[data-harbor-nav]");
  if (!navEl || !navEl.closest(CUSTOM_CHROME)) return null;
  const view = navEl.getAttribute("data-harbor-nav")?.trim() ?? "";
  return isHarborNavView(view) ? { action: "navigate", view } : null;
}
