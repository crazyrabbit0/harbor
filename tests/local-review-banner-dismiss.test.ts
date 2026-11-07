// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { loadStoredSettings } from "../src/lib/settings/load.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const kids = (n: N): N[] =>
  [n.props.children].flat(Infinity).filter((c): c is N => !!c && typeof c === "object");
const names = new Proxy({}, { get: (_t, name) => String(name) });

/** Renders the real LocalTab over `review` unidentified titles with the given dismissal count. */
function localTab(review: number, dismissedAt: number) {
  const updates: unknown[] = [];
  const items = Array.from({ length: review + 2 }, (_, i) => ({
    id: `e${i}`,
    type: "movie",
    title: `T${i}`,
    needsReview: i < review,
  }));
  const settings = {
    ...DEFAULT,
    localAutoScan: false,
    localReviewDismissedCount: dismissedAt,
  };
  const h = hookHarness("src/views/library/local-tab.tsx", "LocalTab", {
    "react/jsx-runtime": jsx,
    "lucide-react": names,
    "@/lib/local-library": {
      localEntryToMeta: () => null,
      removeLocalEntry() {},
      updateLocalEntries() {},
      useLocalLibrary: () => items,
      useLocalLibraryReady: () => true,
    },
    "@/lib/dialog": { confirmDialog: async () => false },
    "@/lib/view": { useViewActions: () => ({ openMeta() {} }) },
    "@/lib/i18n": { useT: () => (key: string) => key },
    "./shared": names,
    "@/components/virtual-grid": names,
    "./local-tab/show-group": {
      ShowGroupCard: "ShowGroupCard",
      groupLocal: (list: typeof items) =>
        list.map((e) => ({ kind: "movie", key: e.id, entry: e, versions: [e] })),
    },
    "./local-tab/scan-mode-modal": names,
    "./local-tab/identify-modal": names,
    "./local-tab/card-actions": {},
    "./local-tab/movie-card": names,
    "./local-tab/toolbar": { ...names, sortGroups: (g: unknown[]) => g },
    "@/lib/settings": {
      useSettings: () => ({ settings, update: (p: unknown) => updates.push(p) }),
    },
    "./local-tab/folders-modal": names,
    "./local-tab/use-local-export": {
      useLocalExport: () => ({ runExport: async () => ({}), onExportOne() {} }),
    },
    "./local-tab/use-local-scan": {
      useLocalScan: () => ({
        autoScan: async () => {},
        pending: null,
        folders: [],
        busy: false,
        error: null,
        progress: null,
        onAddFolder() {},
      }),
    },
    "./local-tab/cw-row": names,
    "./featured-context": { useReportFeatured() {} },
    "./filter-preferences": {
      readLibraryFilterPreferences: () => ({}),
      writeLibraryFilterPreferences() {},
    },
  });
  const tree = h.render({});
  const dismiss = all(tree).find((n) => n.props["aria-label"] === "Dismiss");
  return { tree, dismiss, updates };
}

const shown = (review: number, dismissedAt: number) => !!localTab(review, dismissedAt).dismiss;

test("dismissing hides the titles that were known at the time", () => {
  assert.equal(shown(8, 0), true, "a fresh scan shows the banner");
  assert.equal(shown(8, 8), false, "dismissing 8 hides those 8");
});

test("a later scan that finds more brings the banner back", () => {
  assert.equal(shown(9, 8), true, "a ninth unidentified title is new information");
  assert.equal(shown(20, 8), true);
});

test("identifying some titles does not resurrect a dismissed banner", () => {
  // Going 8 -> 3 by identifying five is progress, not a reason to nag again.
  assert.equal(shown(3, 8), false);
  assert.equal(shown(0, 8), false, "nothing left to review");
});

test("the dismissal is a persisted setting, not component state", () => {
  assert.equal(DEFAULT.localReviewDismissedCount, 0);
  localStorage.setItem("test.review", JSON.stringify({ localReviewDismissedCount: 6 }));
  assert.equal(loadStoredSettings("test.review").localReviewDismissedCount, 6);
  localStorage.setItem("test.review", JSON.stringify({ localReviewDismissedCount: "6" }));
  assert.equal(loadStoredSettings("test.review").localReviewDismissedCount, 0);
});

test("the banner records the count it was dismissed at", () => {
  const { dismiss, updates } = localTab(5, 2);
  dismiss!.props.onClick();
  assert.deepEqual(updates, [{ localReviewDismissedCount: 5 }]);
});

test("Review and Dismiss are siblings, not buttons nested in a button", () => {
  const { tree, dismiss } = localTab(4, 0);
  const shell = all(tree).find((n) => kids(n).includes(dismiss!))!;
  assert.equal(shell.type, "div", "the banner shell must be a div");
  const buttons = kids(shell).filter((n) => n.type === "button");
  assert.equal(buttons.length, 3);
  assert.ok(buttons.some((b) => b.props.children === "Review"));
  for (const b of buttons) {
    assert.equal(
      all(b.props.children).some((n) => n.type === "button"),
      false,
    );
  }
});
