// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("heavy libraries load on first use, not with the app", () => {
  for (const file of ["src/lib/player/html5/bridge.ts", "src/views/multiview/multi-player.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /^import Hls from "hls\.js"/m, file);
    assert.doesNotMatch(src, /^import mpegts from "mpegts\.js"/m, file);
    assert.match(src, /loadHls\(\)/, file);
  }
  for (const file of [
    "src/components/harbor-loader.tsx",
    "src/components/icons/nav-lottie.tsx",
    "src/components/lottie-player.tsx",
    "src/components/installer-viewport/install-overlay.tsx",
    "src/components/voyage/voyage-launch.tsx",
  ]) {
    assert.doesNotMatch(read(file), /^import lottie\b/m, file);
  }
  assert.doesNotMatch(read("src/views/settings/set-icon.tsx"), /\bicons\b.*from "lucide-react"/);
  assert.doesNotMatch(read("src/views/settings/section-cards.tsx"), /\bicons\[/);
});

test("secondary windows load only their own app", () => {
  const main = read("src/main.tsx");
  for (const view of [
    "hdr-overlay-app",
    "dj-deck-app",
    "captions-app",
    "modal-overlay-app",
    "video-pip",
    "pip",
  ]) {
    assert.doesNotMatch(main, new RegExp(`^import .* from "@/views/${view}";`, "m"), view);
    assert.match(main, new RegExp(`import\\("@/views/${view}"\\)`), view);
  }
});

test("rows below the fold render skeletons until scrolled near", () => {
  const row = read("src/components/row.tsx");
  assert.match(row, /const \[seen, setSeen\] = useState\(alwaysActive\)/);
  assert.match(row, /visible && rowSeen \?/);
  for (const file of [
    "award-tiles",
    "genre-tiles",
    "country-tiles",
    "language-tiles",
    "brand-tiles",
    "curated-list-tiles",
  ]) {
    assert.doesNotMatch(read(`src/components/${file}.tsx`), /\balwaysActive\b/, file);
  }
});
