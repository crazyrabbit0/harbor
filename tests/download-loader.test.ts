// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, jsx, names, type N } from "./helpers/plugin-ui-tree.ts";

function renderButton(statuses: string[]) {
  const downloads = statuses.map((status, i) => ({ id: `d${i}`, status, title: "Title" }));
  const harness = hookHarness("src/components/downloads-popover.tsx", "DownloadsButton", {
    "react/jsx-runtime": jsx,
    "lucide-react": names,
    "@/components/download-action-icons": names,
    "@/components/harbor-loader": names,
    "@/lib/download/downloads-store": { ...names, useDownloads: () => downloads },
    "@/lib/i18n": { useT: () => (key: string) => key },
    "@/lib/view": { useViewActions: () => ({ openMeta() {}, setView() {} }) },
  });
  const trigger = all(harness.render()).find((n) => n.props["aria-expanded"] !== undefined);
  assert.ok(trigger);
  return all(trigger.props.children);
}

test("an active download shows the shared Harbor loader at compact size in the trigger", () => {
  const active = renderButton(["downloading", "done"]);
  assert.deepEqual(
    active.map((n) => n.type),
    ["HarborLoader", "span"],
  );
  assert.deepEqual(active[0].props, { size: "xs" });
  const idle = renderButton(["paused", "done"]).map((n) => n.type);
  assert.ok(!idle.includes("HarborLoader"));
  assert.ok(idle.includes("Download"));
});

test("the compact Harbor loader size renders a 7x7 artwork box", () => {
  const harness = hookHarness("src/components/harbor-loader.tsx", "HarborLoader", {
    "react/jsx-runtime": jsx,
    "@/lib/lottie": { withLottie() {} },
    "./custom-artwork": names,
    "@/lib/providers/addon-logo-prefetch": {
      prefetchTopAddonLogos: async () => [],
      prefetchedTopAddonLogos: () => [],
    },
  });
  const art = all(harness.render({ size: "xs" })).find((n: N) => n.type === "CustomArtwork");
  assert.ok(art);
  assert.deepEqual(String(art.props.className).split(" ").slice(1), ["h-7", "w-7"]);
});
