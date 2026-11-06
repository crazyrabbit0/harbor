// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";

type El = { type: unknown; props: Record<string, any> };
const element = (type: unknown, props: Record<string, any>): El => ({ type, props });

function controls(opts: {
  fullscreenMode: string;
  fullscreen: boolean;
  maximized: boolean;
  nativeTitleBar?: boolean;
  tauri?: boolean;
}) {
  const calls: string[] = [];
  const h = hookHarness(
    "src/components/player/transport/window-control-buttons.tsx",
    "WindowControlButtons",
    {
      "lucide-react": { Copy: "Copy", Minus: "Minus", Square: "Square", X: "X" },
      "@/lib/fullscreen-state": { toggleWindowFullscreen: () => calls.push("fullscreen") },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({
            fullscreenMode: opts.fullscreenMode,
            useNativeTitleBar: opts.nativeTitleBar ?? false,
          }),
      },
      "@/lib/use-window-fullscreen": { useWindowFullscreen: () => opts.fullscreen },
      "@/lib/window": {
        close: () => calls.push("close"),
        minimize: () => calls.push("minimize"),
        toggleMaximize: () => calls.push("maximize"),
        useMaximized: () => opts.maximized,
      },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    { window: opts.tauri === false ? {} : { __TAURI_INTERNALS__: {} } },
  );
  const tree = h.render({ t: (key: string) => key }) as El | null;
  const buttons = (tree?.props.children ?? []) as El[];
  return { calls, tree, buttons, expand: buttons[1] };
}

const iconOf = (button: El) => (button.props.children as El).type;

test("the player window control uses shared fullscreen unless maximize mode is selected", () => {
  const fullscreen = controls({ fullscreenMode: "fullscreen", fullscreen: false, maximized: true });
  fullscreen.expand.props.onClick();
  assert.deepEqual(fullscreen.calls, ["fullscreen"]);
  assert.equal(fullscreen.expand.props["aria-label"], "Fullscreen");
  assert.equal(iconOf(fullscreen.expand), "Square");

  const inFullscreen = controls({
    fullscreenMode: "fullscreen",
    fullscreen: true,
    maximized: false,
  });
  assert.equal(inFullscreen.expand.props["aria-label"], "Exit fullscreen");
  assert.equal(iconOf(inFullscreen.expand), "Copy");

  const maximize = controls({ fullscreenMode: "maximized", fullscreen: true, maximized: false });
  maximize.expand.props.onClick();
  assert.deepEqual(maximize.calls, ["maximize"]);
  assert.equal(maximize.expand.props["aria-label"], "chrome.maximize");
  assert.equal(iconOf(maximize.expand), "Square");

  const maximized = controls({ fullscreenMode: "maximized", fullscreen: false, maximized: true });
  assert.equal(maximized.expand.props["aria-label"], "chrome.restore");
  assert.equal(iconOf(maximized.expand), "Copy");
});

test("the player window controls render only with the custom title bar inside Tauri", () => {
  const base = { fullscreenMode: "fullscreen", fullscreen: false, maximized: false };
  assert.equal(controls({ ...base, nativeTitleBar: true }).tree, null);
  assert.equal(controls({ ...base, tauri: false }).tree, null);
  const shown = controls(base);
  shown.buttons[0].props.onClick();
  shown.buttons[2].props.onClick();
  assert.deepEqual(shown.calls, ["minimize", "close"]);
});
