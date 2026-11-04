import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as modal from "../src/lib/external-link-viewer-modal.ts";
import * as controller from "../src/lib/social/external-link-journey-controller.ts";
import * as preference from "../src/lib/social/external-link-preference.ts";
import * as policy from "../src/lib/social/external-link-policy.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const { EXTERNAL_LINK_FRAME_PERMISSIONS, EXTERNAL_LINK_FRAME_SANDBOX, SOFT_LOAD_TIMEOUT_MS } = modal;
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

type N = { type: unknown; key?: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"], key?: unknown) => ({ type, props, key });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";
const translate = () => (s: string, vars?: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_m, k) => vars?.[k] ?? "");

function fakeWindow() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const listeners = new Map<string, Array<(e: any) => void>>();
  let id = 0;
  return {
    timers,
    listeners,
    window: {
      setTimeout: (fn: () => void, ms: number) => (timers.set(++id, { fn, ms }), id),
      clearTimeout: (i: number) => timers.delete(i),
      requestAnimationFrame: (fn: () => void) => (fn(), 0),
      addEventListener: (type: string, fn: (e: any) => void) =>
        listeners.set(type, [...(listeners.get(type) ?? []), fn]),
      removeEventListener: (type: string, fn: (e: any) => void) =>
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((l) => l !== fn),
        ),
    },
    fire(type: string, event: object) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

const LINK = { href: "https://example.com/a", hostname: "example.com", protocol: "https:", canOpenInHarbor: true };

function viewer(exportName: "ExternalLinkViewer" | "ExternalLinkViewerFrame") {
  const w = fakeWindow();
  const h = hookHarness(
    "src/components/external-link-viewer.tsx",
    exportName,
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/lib/i18n": { useT: translate },
      "@/components/harbor-loader": { HarborLoader: "HarborLoader" },
      "@/lib/external-link-viewer-modal": modal,
      "react/jsx-runtime": jsx,
    },
    { window: w.window },
    ["ExternalLinkViewerFrame"],
  );
  return { h, ...w };
}

test("viewer frame keeps the fixed remote-content boundary and settles on load", () => {
  const calls: string[] = [];
  const v = viewer("ExternalLinkViewerFrame");
  const props = {
    link: LINK,
    reloadKey: 0,
    openingBrowser: false,
    browserError: null,
    onOpenBrowser: () => calls.push("browser"),
    onReload: () => calls.push("reload"),
  };
  const tree = v.h.render(props);
  const frame = all(tree).find((n) => n.type === "iframe")!;
  assert.equal(frame.props.src, LINK.href);
  assert.equal(frame.props.sandbox, "allow-scripts");
  assert.equal(frame.props.sandbox, EXTERNAL_LINK_FRAME_SANDBOX);
  assert.equal(frame.props.allow, EXTERNAL_LINK_FRAME_PERMISSIONS);
  assert.match(EXTERNAL_LINK_FRAME_PERMISSIONS, /camera 'none'/);
  assert.equal(frame.props.referrerPolicy, "no-referrer");
  assert.equal(frame.props.tabIndex, -1);
  const loader = all(tree).find((n) => n.type === "HarborLoader")!;
  assert.equal(loader.props.caption, "Loading example.com");
  assert.deepEqual([...v.timers.values()].map((t) => t.ms), [SOFT_LOAD_TIMEOUT_MS]);

  frame.props.onLoad();
  const loaded = v.h.render(props);
  assert.equal(all(loaded).some((n) => n.type === "HarborLoader"), false);
  assert.equal(v.timers.size, 0, "a loaded page cancels the slow timer");
  assert.equal(all(loaded).some((n) => n.props.role === "status"), false);
  assert.deepEqual(calls, []);
});

test("viewer politely announces only the slow-loading status copy", () => {
  const calls: string[] = [];
  const v = viewer("ExternalLinkViewerFrame");
  const props = {
    link: LINK,
    reloadKey: 0,
    openingBrowser: false,
    browserError: null,
    onOpenBrowser: () => calls.push("browser"),
    onReload: () => calls.push("reload"),
  };
  v.h.render(props);
  for (const t of v.timers.values()) t.fn();
  const tree = v.h.render(props);
  const status = all(tree).find((n) => n.props.role === "status")!;
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(all(status).some((n) => n.type === "button"), false, "the buttons sit outside it");
  assert.equal(all(tree).some((n) => n.type === "HarborLoader"), false);
  const buttons = all(tree).filter((n) => n.type === "button");
  buttons.find((b) => text(b) === "Retry")!.props.onClick();
  buttons.find((b) => text(b) === "Open in browser")!.props.onClick();
  assert.deepEqual(calls, ["reload", "browser"]);
});

test("the viewer is plain page content with a reload that remounts the frame", () => {
  const calls: string[] = [];
  const v = viewer("ExternalLinkViewer");
  const props = {
    link: LINK,
    openingBrowser: false,
    browserError: null,
    onOpenBrowser: () => calls.push("browser"),
    onClose: () => calls.push("close"),
    onReload: () => calls.push("reload"),
  };
  const tree = v.h.render(props);
  assert.equal(all(tree).some((n) => n.props.role === "dialog" || n.props["aria-modal"]), false);
  const frameKey = () =>
    all(v.h.render(props)).find((n) => typeof n.type === "function")!.key;
  assert.equal(frameKey(), `${LINK.href}::0`);
  all(tree).find((n) => n.props["aria-label"] === "Reload original link")!.props.onClick();
  assert.equal(frameKey(), `${LINK.href}::1`);
  const close = all(tree).find((n) => n.props["aria-label"] === "Close")!;
  assert.equal(close.props.autoFocus, true);
  close.props.onClick();
  assert.deepEqual(calls, ["reload", "close"]);
  assert.doesNotMatch(
    read("src/components/external-link-viewer.tsx"),
    /@tauri-apps|postMessage|addEventListener\("message"|\binvoke\(/,
  );
});

function splitButton(props: Record<string, unknown>) {
  const w = fakeWindow();
  const h = hookHarness(
    "src/components/external-link-split-button.tsx",
    "ExternalLinkSplitButton",
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/components/icons/harbor-mark": { HarborMark: "HarborMark" },
      "@/lib/social/external-link-journey-controller": controller,
      "@/lib/i18n": { useT: translate },
      "react/jsx-runtime": jsx,
    },
    { window: w.window },
  );
  return { render: () => h.render(props), ...w };
}

test("warning uses a direct main action and an alternate-only menu", async () => {
  const opens: boolean[] = [];
  const picks: string[] = [];
  const base = {
    main: "browser",
    alternate: "harbor",
    menuOpen: false,
    disabled: false,
    menuButtonRef: { current: null },
    onMenuOpenChange: (open: boolean) => opens.push(open),
    onSelect: (action: string, source: string) => picks.push(`${action}:${source}`),
  };
  const closed = splitButton(base).render();
  const buttons = all(closed).filter((n) => n.type === "button");
  assert.equal(text(buttons[0]), "Continue in browser");
  const arrow = buttons.find((b) => b.props["aria-haspopup"] === "menu")!;
  assert.equal(arrow.props["aria-expanded"], false);
  assert.equal(all(closed).some((n) => n.props.role === "menu"), false);
  arrow.props.onClick();
  let prevented = false;
  arrow.props.onKeyDown({ key: "ArrowDown", preventDefault: () => (prevented = true), stopPropagation() {} });
  assert.deepEqual(opens, [true, true]);
  assert.equal(prevented, true);
  buttons[0].props.onClick();

  const open = splitButton({ ...base, menuOpen: true });
  const tree = open.render();
  const focused: string[] = [];
  assert.equal(all(tree).find((n) => n.props["aria-haspopup"] === "menu")!.props["aria-expanded"], true);
  const item = all(tree).find((n) => n.props.role === "menuitem")!;
  item.props.ref.current = { focus: () => focused.push("item") };
  all(tree)[0].props.ref.current = { contains: (node: unknown) => node === "inside" };
  open.render();
  await flushPromises();
  assert.deepEqual(focused, ["item"], "the menu focuses its only item");
  assert.equal(all(item).find((n) => typeof n.type === "function")?.props.action, "harbor");
  item.props.onClick();
  open.fire("pointerdown", { target: "inside" });
  assert.deepEqual(opens, [true, true]);
  open.fire("pointerdown", { target: "outside" });
  assert.deepEqual(opens, [true, true, false], "an outside press closes the menu");
  assert.deepEqual(picks, ["browser:main", "harbor:alternate"]);

  const httpOnly = all(splitButton({ ...base, alternate: null }).render());
  assert.equal(httpOnly.some((n) => n.props["aria-haspopup"] === "menu"), false);
});

function interstitial(url: string, options: { open?: (href: string) => Promise<unknown> } = {}) {
  const w = fakeWindow();
  const log = { closes: 0, opened: [] as string[], remembered: [] as string[], portals: [] as unknown[] };
  const body = { tag: "body" };
  const journey = { url, generation: 3 };
  const mocks = {
    "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
    "react-dom": {
      createPortal: (tree: unknown, container: unknown) => (log.portals.push(container), tree),
    },
    "@/components/external-link-split-button": { ExternalLinkSplitButton: "Split" },
    "@/components/external-link-viewer": { ExternalLinkViewer: "Viewer" },
    "@/lib/back-intercept": { pushBackHandler: () => () => {} },
    "@/lib/external-link-viewer-modal": { createExternalLinkViewerFocusScope: () => () => {} },
    "@/lib/keyboard-navigation/geometry": { isBackKey: (e: { key: string }) => e.key === "Escape" },
    "@/lib/i18n": { useT: translate },
    "@/lib/social/external-link-journey-controller": controller,
    "@/lib/social/external-link-preference": {
      ...preference,
      readExternalLinkDestinationPreference: () => "browser",
      writeExternalLinkDestinationPreference: (p: string) => log.remembered.push(p),
    },
    "@/lib/social/external-link-policy": policy,
    "@/lib/social/link-out": {
      closeLinkOut: () => log.closes++,
      isCurrentLinkOutJourney: () => true,
      useLinkOutJourney: () => journey,
    },
    "@/lib/window": {
      openExternalUrlStrict: options.open ?? (async (href: string) => log.opened.push(href)),
    },
    "react/jsx-runtime": jsx,
  };
  const globals = { window: w.window, document: { body } };
  const outer = hookHarness("src/components/link-out-interstitial.tsx", "LinkOutInterstitial", mocks, globals).render() as N;
  const inner = hookHarness(
    "src/components/link-out-interstitial.tsx",
    "LinkOutJourneyInterstitial",
    mocks,
    globals,
    ["LinkOutJourneyInterstitial"],
  );
  const render = (pref = "browser") =>
    inner.render({ journey, preference: pref, onPreferenceChange: (p: string) => log.remembered.push(p) }) as N;
  return { w, log, body, outer, render };
}

const split = (tree: N) => all(tree).find((n) => n.type === "Split");

test("the warning is the first stage of a single portal keyed by journey", () => {
  const { outer, log, body, render } = interstitial("https://example.com/a");
  assert.deepEqual(log.portals, [body]);
  assert.equal(outer.key, 3, "a new journey remounts the warning");
  outer.props.onPreferenceChange("harbor");
  assert.deepEqual(log.remembered, ["harbor"]);
  const tree = render();
  assert.equal(tree.props.role, "dialog");
  assert.equal(all(tree).filter((n) => n.props.role === "dialog").length, 1);
  assert.equal(all(tree).some((n) => n.type === "Viewer"), false, "the viewer never opens first");
  assert.deepEqual([split(tree)!.props.main, split(tree)!.props.alternate], ["browser", "harbor"]);
  assert.equal((read("src/App.tsx").match(/<LinkOutInterstitial \/>/g) ?? []).length, 1);
});

test("choosing a destination opens the viewer or the strict browser opener", async () => {
  const i = interstitial("https://example.com/a");
  split(i.render())!.props.onSelect("harbor", "alternate");
  assert.deepEqual(i.log.remembered, ["harbor"], "only an alternate choice is remembered");
  const viewerStage = i.render();
  const shown = all(viewerStage).find((n) => n.type === "Viewer")!;
  assert.equal(shown.props.link.href, "https://example.com/a");
  shown.props.onOpenBrowser();
  await flushPromises();
  assert.deepEqual(i.log.opened, ["https://example.com/a"]);
  assert.equal(i.log.closes, 1, "a successful browser open closes the journey");

  const http = interstitial("http://example.com/a");
  assert.deepEqual([split(http.render())!.props.main, split(http.render())!.props.alternate], ["browser", null]);
  split(http.render())!.props.onSelect("harbor", "main");
  assert.equal(all(http.render()).some((n) => n.type === "Viewer"), false, "HTTP never opens in Harbor");
});

test("a failed browser open keeps the warning with an error", async () => {
  let attempts = 0;
  const i = interstitial("https://example.com/a", {
    open: async () => {
      attempts++;
      throw new Error("no browser");
    },
  });
  split(i.render())!.props.onSelect("browser", "main");
  await flushPromises();
  const tree = i.render();
  assert.equal(i.log.closes, 0);
  assert.deepEqual(i.log.remembered, [], "the main action is not remembered");
  assert.equal(text(all(tree).find((n) => n.props.role === "alert")), "no browser");
  assert.equal(split(tree)!.props.disabled, false);
  split(tree)!.props.onSelect("browser", "main");
  await flushPromises();
  assert.equal(attempts, 2, "the opener latch is released for a retry");

  split(i.render())!.props.onSelect("harbor", "alternate");
  const shown = all(i.render()).find((n) => n.type === "Viewer")!;
  shown.props.onOpenBrowser();
  await flushPromises();
  assert.equal(
    all(i.render()).find((n) => n.type === "Viewer")!.props.browserError,
    "no browser",
    "the viewer shows the failure too",
  );
});

test("Back closes an open menu before it closes the journey", () => {
  const i = interstitial("https://example.com/a");
  const focused: string[] = [];
  const tree = i.render();
  split(tree)!.props.menuButtonRef.current = { focus: () => focused.push("arrow") };
  split(tree)!.props.onMenuOpenChange(true);
  i.render();
  const escape = () => {
    let prevented = false;
    i.w.fire("keydown", { key: "Escape", preventDefault: () => (prevented = true), stopImmediatePropagation() {} });
    return prevented;
  };
  assert.equal(escape(), true);
  assert.equal(split(i.render())!.props.menuOpen, false);
  assert.deepEqual(focused, ["arrow"], "focus returns to the arrow");
  assert.equal(i.log.closes, 0);
  escape();
  assert.equal(i.log.closes, 1);
});
