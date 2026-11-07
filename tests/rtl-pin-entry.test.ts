// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { relative } from "node:path";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { fileURLToPath } from "node:url";
import * as languages from "../src/lib/i18n/languages.ts";
import * as regionalLabels from "../src/lib/i18n/regional-labels.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");
const KEYPADS = [
  "src/components/parental-pin-modal.tsx",
  "src/components/profile-picker/pin-entry.tsx",
];

const BP_KEYPADS = ["src/views/big-picture/bp-who-is-watching-pin.tsx"];

type Node = { type: unknown; props: Record<string, any> };
const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "fragment" };
const elements = (node: unknown, out: Node[] = []): Node[] => {
  if (Array.isArray(node)) node.forEach((child) => elements(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    out.push(node as Node);
    elements((node as Node).props.children, out);
  }
  return out;
};
const text = (node: unknown): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node && typeof node === "object" && "props" in node
      ? text((node as Node).props.children)
      : typeof node === "string"
        ? node
        : "";
const t = (key: string) => key;
const timers = { setTimeout: () => 0, clearTimeout: () => {} };
const listeners = { addEventListener: () => {}, removeEventListener: () => {} };

test("Arabic really does flip the document, so PIN order is at risk", () => {
  const root = { dir: "", lang: "" };
  const store = loadModule(
    "src/lib/i18n/store.ts",
    {
      "@/lib/profile-roster": { activeSettingsSource: () => ({ linked: true }) },
      react: { useSyncExternalStore: () => undefined },
      "./languages": languages,
      "./regional-labels": regionalLabels,
      "./load-locale": { ensureUiLocale: () => {} },
    },
    { document: { documentElement: root }, localStorage: undefined },
  );
  assert.equal(root.dir, "ltr");
  store.setUiLanguage("ar");
  assert.equal(root.dir, "rtl");
  store.setUiLanguage("en");
  assert.equal(root.dir, "ltr");
});

// The grid that holds the digit keys, and the button wrapping the PIN field.
function keypadParts(tree: unknown, digitOf: (node: Node) => string) {
  const nodes = elements(tree);
  const grid = nodes.find((node) => {
    const kids = [node.props.children].flat(Infinity) as unknown[];
    return kids.some((kid) => Array.isArray(kid) || (kid as Node)?.props?.children === "0");
  });
  const digits = elements(grid?.props.children).map(digitOf).filter(Boolean);
  return { nodes, grid, digits };
}

function renderKeypad(path: string) {
  const mocks = {
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": { ChevronLeft: () => null, Delete: () => null, X: () => null },
    "@/lib/i18n": { useT: () => t },
    "react-dom": { createPortal: (node: unknown) => node },
    "@/lib/keyboard-navigation/geometry": { isVisible: () => true },
  };
  const globals = { ...timers, window: listeners, document: { body: {} } };
  if (path.endsWith("pin-entry.tsx")) {
    const h = hookHarness(path, "PinEntry", mocks, globals);
    return h.render({ title: "", subtitle: "", mode: "verify", onComplete() {}, onBack() {} });
  }
  const h = hookHarness(path, "ParentalPinModal", mocks, globals);
  return h.render({
    mode: { kind: "unlock", onUnlock() {}, onCancel() {} },
    verify: async () => true,
  });
}

test("every numeric keypad stays left to right", () => {
  for (const p of KEYPADS) {
    const tree = renderKeypad(p);
    const { nodes, grid, digits } = keypadParts(tree, (node) =>
      typeof node.props.children === "string" ? node.props.children : "",
    );
    assert.equal(grid?.props.dir, "ltr", `${p} keypad would render 3,2,1 in Arabic`);
    assert.deepEqual(digits, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    const field = nodes.find((node) => node.props["aria-label"] === "Focus PIN entry");
    assert.equal(field?.props.dir, "ltr", `${p} PIN field would fill right to left in Arabic`);
  }
});

test("the ten-foot keypad stays left to right too", () => {
  for (const p of BP_KEYPADS) {
    const h = hookHarness(
      p,
      "BpWhoPin",
      {
        "react/jsx-runtime": jsxRuntime,
        "lucide-react": { ChevronLeft: () => null, Delete: () => null },
        "@/lib/profile-password": { verifyProfilePassword: async () => false },
        "@/lib/profiles": { profileInitials: () => "P" },
        "./bp-i18n": { useBpT: () => t },
        "./use-bp-focus": { setBpFocus: () => {} },
        "./bp-who-is-watching-logic": { bpWhoPrefersReducedMotion: () => false },
      },
      { window: { ...timers, setInterval: () => 0, clearInterval: () => {} } },
    );
    const tree = h.render({
      profile: { id: "p1", name: "P", color: "red", passwordHash: "hash" },
      onCancel() {},
      onSuccess() {},
    });
    const nodes = elements(tree);
    const grid = nodes.find((node) => "data-bp-grid" in node.props);
    assert.equal(grid?.props.dir, "ltr", `${p} keypad would render 3,2,1 in Arabic`);
    const keys = elements(grid?.props.children).filter((node) => "data-bp-key" in node.props);
    assert.deepEqual(
      keys.slice(0, 9).map((node) => text(node)),
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    );
    const dots = nodes.find(
      (node) => node.props["aria-hidden"] === true && node.props.children?.length === 4,
    );
    assert.equal(dots?.props.dir, "ltr", `${p} PIN dots would fill right to left in Arabic`);
  }
});

// Repo-wide inventory: a new keypad elsewhere must be added to the lists above.
test("these are still the only numeric keypads in the app", () => {
  const found: string[] = [];
  const walk = (dir: URL) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
      else if (e.name.endsWith(".tsx")) {
        const rel = relative(fileURLToPath(at("")), fileURLToPath(new URL(e.name, dir))).replaceAll(
          "\\",
          "/",
        );
        if (read(rel).includes('"1", "2", "3", "4", "5", "6", "7", "8", "9"')) found.push(rel);
      }
    }
  };
  walk(at("src/"));
  assert.deepEqual(found.sort(), [...KEYPADS, ...BP_KEYPADS].sort());
});
