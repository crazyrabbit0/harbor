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

test("rarely shown chrome and its CSS load on demand, not with the app", () => {
  const app = read("src/App.tsx");
  for (const module of [
    "@/components/music/music-dock",
    "@/components/music/music-surprise-prompt",
    "@/views/games/game-library-dock",
    "@/views/games/game-dock-welcome",
    "@/views/sports/access-gate",
  ]) {
    assert.doesNotMatch(app, new RegExp(`^import .* from "${module}";`, "m"), module);
    assert.match(app, new RegExp(`import\\("${module}"\\)`), module);
  }
  assert.doesNotMatch(read("src/main.tsx"), /flag-icons/);
  assert.match(
    read("src/components/flag.tsx"),
    /^import "flag-icons\/css\/flag-icons\.min\.css";/m,
  );
});

test("stores read storage on first use, not at import", () => {
  for (const [file, eager] of [
    ["src/lib/theme-auth.ts", /^migrateLegacyGlobal\(\);/m],
    ["src/lib/anime-detect.ts", /^const detected = load\(\);/m],
    ["src/lib/iptv/playlists-store.ts", /^readPlaylists\(\);/m],
    ["src/lib/sports/favourites.ts", /^readFavourites\(\);/m],
    ["src/lib/sports/reminders.ts", /^let cache = read\(\);/m],
    ["src/lib/download/downloads-store.ts", /^hydrate\(\);/m],
    ["src/lib/music/transport.ts", /^let transport = readTransport\(\);/m],
    ["src/lib/music/dock-layout.ts", /^let layout = read\(\);/m],
    ["src/lib/music/appearance.ts", /^let appearance = read\(\);/m],
    ["src/lib/music/recent-context.ts", /^let store = read\(\);/m],
    ["src/lib/music/hidden-recents.ts", /^let hidden = read\(\);/m],
    ["src/lib/providers/jikan-cache.ts", /^const armMem: ArmCache = readCache\(\);/m],
  ] as const) {
    assert.doesNotMatch(read(file), eager, file);
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
