import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../src/lib/social/external-link-journey-controller.ts";
import * as policy from "../src/lib/social/external-link-policy.ts";
import * as preference from "../src/lib/social/external-link-preference.ts";
import { renderBbcode } from "../src/lib/social/bbcode.ts";
import { handleLinkOutActivation, safeExternalUrl } from "../src/lib/social/link-out-activation.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

type Listener = { fn: (e: any) => void; capture: unknown };
type Node = { type: unknown; props: Record<string, any> };
const element = (type: unknown, props: Node["props"], key?: unknown) => ({ type, props, key });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };

function dialog() {
  const listeners = new Map<string, Listener[]>();
  const log = { closes: 0, backHandlers: [] as Array<() => unknown>, backRemoved: 0 };
  const journey = { url: "https://example.com/a", generation: 1 };
  const win = {
    requestAnimationFrame: (fn: () => void) => (fn(), 0),
    addEventListener: (type: string, fn: (e: any) => void, capture?: unknown) =>
      listeners.set(type, [...(listeners.get(type) ?? []), { fn, capture }]),
    removeEventListener: (type: string, fn: (e: any) => void) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l.fn !== fn),
      ),
  };
  const harness = hookHarness(
    "src/components/link-out-interstitial.tsx",
    "LinkOutJourneyInterstitial",
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "react-dom": { createPortal: (tree: unknown) => tree },
      "@/components/external-link-split-button": { ExternalLinkSplitButton: "Split" },
      "@/components/external-link-viewer": { ExternalLinkViewer: "Viewer" },
      "@/lib/back-intercept": {
        pushBackHandler: (handler: () => unknown) => (
          log.backHandlers.push(handler),
          () => {
            log.backRemoved++;
          }
        ),
      },
      "@/lib/external-link-viewer-modal": { createExternalLinkViewerFocusScope: () => () => {} },
      "@/lib/keyboard-navigation/geometry": {
        isBackKey: (e: { key: string }) => e.key === "Escape",
      },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/social/external-link-journey-controller": controller,
      "@/lib/social/external-link-preference": preference,
      "@/lib/social/external-link-policy": policy,
      "@/lib/social/link-out": {
        closeLinkOut: () => log.closes++,
        isCurrentLinkOutJourney: () => true,
        useLinkOutJourney: () => journey,
      },
      "@/lib/window": { openExternalUrlStrict: async () => {} },
      "react/jsx-runtime": jsx,
    },
    { window: win },
    ["LinkOutJourneyInterstitial"],
  );
  const tree = harness.render({
    journey,
    preference: "browser",
    onPreferenceChange: () => {},
  }) as Node;
  const dispatch = (type: string, key = "Escape") => {
    const event = {
      key,
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
    };
    for (const l of listeners.get(type) ?? []) l.fn(event);
    return event;
  };
  return { harness, tree, listeners, log, dispatch };
}

test("app-managed bbcode links do not request native blank-window navigation", () => {
  for (const body of [
    "https://example.com/watch?id=42",
    "[url=https://example.com/watch?id=42]Example[/url]",
  ]) {
    const html = renderBbcode(body);
    assert.match(html, /<a href="https:\/\/example\.com\/watch\?id=42"/);
    assert.match(html, /rel="noopener noreferrer nofollow"/);
    assert.doesNotMatch(html, /target="_blank"/);
  }
});

test("bbcode link safety policy remains unchanged", () => {
  assert.doesNotMatch(renderBbcode("[url=javascript:alert(1)]unsafe[/url]"), /<a /);
  assert.doesNotMatch(renderBbcode("https://bit.ly/harbor-test"), /<a /);
});

test("external link routing accepts only HTTP(S) destinations", () => {
  assert.equal(safeExternalUrl(" https://example.com/path "), "https://example.com/path");
  assert.equal(safeExternalUrl("http://example.com/path"), "http://example.com/path");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("file:///C:/Windows/System32/calc.exe"), null);
  assert.equal(safeExternalUrl("not a URL"), null);
});

test("unsafe delegated links are consumed without being opened", () => {
  let prevented = false;
  const opened: string[] = [];
  const handled = handleLinkOutActivation(
    {
      target: {
        closest: () => ({ getAttribute: () => "javascript:alert(1)" }),
      } as unknown as EventTarget,
      preventDefault: () => {
        prevented = true;
      },
    },
    (href) => opened.push(href),
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(opened, []);
});

test("delegated primary and middle clicks prevent WebView navigation and route the exact URL", () => {
  for (const button of [0, 1]) {
    const opened: string[] = [];
    let prevented = false;
    const handled = handleLinkOutActivation(
      {
        button,
        target: {
          closest: (selector: string) => {
            assert.equal(selector, "a");
            return {
              getAttribute: (name: string) => (name === "href" ? "https://example.com/path" : null),
            };
          },
        } as unknown as EventTarget,
        preventDefault: () => {
          prevented = true;
        },
      },
      (href) => opened.push(href),
    );

    assert.equal(handled, true);
    assert.equal(prevented, true);
    assert.deepEqual(opened, ["https://example.com/path"]);
  }
});

test("delegated non-link activation keeps the default interaction", () => {
  let prevented = false;
  const opened: string[] = [];
  const handled = handleLinkOutActivation(
    {
      target: { closest: () => null } as unknown as EventTarget,
      preventDefault: () => {
        prevented = true;
      },
    },
    (href) => opened.push(href),
  );

  assert.equal(handled, false);
  assert.equal(prevented, false);
  assert.deepEqual(opened, []);
});

test("delegated right-click keeps the context-menu interaction", () => {
  let prevented = false;
  const opened: string[] = [];
  const handled = handleLinkOutActivation(
    {
      button: 2,
      target: {
        closest: () => ({ getAttribute: () => "https://example.com/path" }),
      } as unknown as EventTarget,
      preventDefault: () => {
        prevented = true;
      },
    },
    (href) => opened.push(href),
  );

  assert.equal(handled, false);
  assert.equal(prevented, false);
  assert.deepEqual(opened, []);
});

test("the confirmation renders as a modal dialog", () => {
  const { tree } = dialog();
  assert.equal(tree.props.role, "dialog");
  assert.equal(tree.props["aria-modal"], "true");
});

test("the confirmation registers on the global back stack and closes the journey", () => {
  const { log } = dialog();
  assert.equal(log.backHandlers.length, 1);
  assert.equal(log.backHandlers[0](), true);
  assert.equal(log.closes, 1);
});

test("a capturing keydown listener takes back keys and ignores the rest", () => {
  const { listeners, log, dispatch } = dialog();
  assert.equal(listeners.get("keydown")?.length, 1);
  assert.equal(listeners.get("keydown")![0].capture, true);
  const other = dispatch("keydown", "a");
  assert.deepEqual([other.prevented, other.stopped, log.closes], [false, false, 0]);
  const back = dispatch("keydown");
  assert.deepEqual([back.prevented, back.stopped, log.closes], [true, true, 1]);
});

test("a capturing local-back listener consumes the event and closes the journey", () => {
  const { listeners, log, dispatch } = dialog();
  assert.equal(listeners.get("harbor:local-back")?.length, 1);
  assert.equal(listeners.get("harbor:local-back")![0].capture, true);
  const event = dispatch("harbor:local-back");
  assert.deepEqual([event.prevented, event.stopped, log.closes], [true, true, 1]);
});

test("unmounting releases the back stack entry and both listeners", () => {
  const { harness, listeners, log } = dialog();
  harness.unmount();
  assert.equal(log.backRemoved, 1);
  assert.equal(listeners.get("keydown")?.length, 0);
  assert.equal(listeners.get("harbor:local-back")?.length, 0);
});
