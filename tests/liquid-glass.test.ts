import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";

type El = { type: string; props: Record<string, any> };

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const element = (type: string, props: Record<string, any>): El => ({ type, props });

function render(props: Record<string, unknown> = {}) {
  const gpuCalls: string[] = [];
  const h = hookHarness(
    "src/components/ThreeLiquidGlassSurface.tsx",
    "LiquidGlassSurface",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element },
      "@/components/ExperimentalLiquidGlassSurface": { ExperimentalLiquidGlassSurface: () => null },
      "@/lib/settings": { useSettingsSelector: () => ({}) },
    },
    {
      requestAnimationFrame: () => gpuCalls.push("requestAnimationFrame"),
      document: {
        createElement: (tag: string) => {
          gpuCalls.push(tag);
          return {};
        },
      },
    },
  );
  const root = h.render({ children: "content", ...props }) as El;
  return { root, gpuCalls };
}

function elements(node: any): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}

test("liquid glass does not ship the Three.js runtime or types", () => {
  assert.equal(packageJson.dependencies?.three, undefined);
  assert.equal(packageJson.devDependencies?.["@types/three"], undefined);
  // The harness throws "Unexpected dependency" for any import beyond the mocked three.
  assert.doesNotThrow(() => render());
});

test("liquid glass renders plain divs with CSS gradients and no GPU render loop", () => {
  const { root, gpuCalls } = render();
  assert.deepEqual(
    elements(root).map((el) => el.type),
    ["div", "div"],
  );
  assert.deepEqual(gpuCalls, []);
  const style = root.props.style;
  assert.match(style.backgroundImage, /linear-gradient/);
  assert.match(style.backdropFilter, /^blur\(8px\)/);
  assert.equal("WebkitBackdropFilter" in style, false);
  assert.equal(render({ backdropBlur: false }).root.props.style.backdropFilter, undefined);
  assert.equal(render({ blurRadius: 0 }).root.props.style.backdropFilter, undefined);
});

test("liquid glass keeps its public compatibility props", () => {
  const legacy = {
    shaderRadius: 4,
    alwaysActive: true,
    refractionStrength: 1,
    lensStrength: 1,
    causticsStrength: 1,
    motionSpeed: 1,
    intensity: 0.5,
    variant: "overlay",
    backdropBlur: true,
  };
  const { root } = render({ ...legacy, className: "outer", surfaceClassName: "inner", id: "x" });
  for (const name of Object.keys(legacy)) assert.equal(name in root.props, false, name);
  assert.deepEqual(root.props.className.split(" ").filter(Boolean), ["outer", "inner"]);
  assert.equal(root.props.id, "x");
  assert.equal(root.props["data-liquid-glass"], "interactive");
  assert.equal(render({ interactive: false }).root.props["data-liquid-glass"], "static");
  assert.notEqual(
    render({ variant: "overlay" }).root.props.style.backgroundColor,
    render().root.props.style.backgroundColor,
  );
});
