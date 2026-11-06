// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { arabicAwareMatch, normalizeArabic } from "../src/lib/iptv/rtl.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, jsx, names, t, type N } from "./helpers/plugin-ui-tree.ts";

const QUERY = "الدم المشروك";
const q = normalizeArabic(QUERY);

const DIRTY_TITLES: Array<[string, string]> = [
  ["exact", "الدم المشروك"],
  ["provider prefix", "AR | الدم المشروك"],
  ["harakat", "الدَّم المشروك"],
  ["tatweel", "الدم المشـــروك"],
  ["hamza alef", "أالدم المشروك"],
  ["rlm mark", "‏الدم المشروك"],
  ["lrm between words", "الدم‎ المشروك"],
  ["zero width space", "الدم المش​روك"],
  ["non breaking space", "الدم المشروك"],
  ["decomposed", "الدم المشروك".normalize("NFD")],
  ["double space", "الدم  المشروك"],
];

for (const [label, title] of DIRTY_TITLES) {
  test(`iptv search finds an arabic title with ${label}`, () => {
    assert.ok(normalizeArabic(title).includes(q), `"${title}" should match "${QUERY}"`);
  });
}

test("unrelated titles still do not match", () => {
  assert.ok(!normalizeArabic("مسلسل آخر تماما").includes(q));
  assert.ok(!normalizeArabic("Breaking Bad S01").includes(q));
});

test("arabic-indic digits fold to ascii so year searches work", () => {
  assert.ok(normalizeArabic("فيلم ٢٠٢٤").includes(normalizeArabic("2024")));
});

test("live tv channel search shares the same normalizer", () => {
  assert.ok(arabicAwareMatch("قناة‏  الجزيرة", normalizeArabic("الجزيره")));
});

function vodHarness(titles: string[]) {
  let normalizeCalls = 0;
  const movies = titles.map((title, i) => ({ id: `m${i}`, title, year: null, logo: null }));
  const harness = hookHarness("src/views/playlist-vod.tsx", "PlaylistVodView", {
    "react/jsx-runtime": jsx,
    "lucide-react": names,
    "@/components/icons/search-icon": names,
    "@/lib/i18n": { useT: () => t },
    "@/lib/iptv/rtl": {
      normalizeArabic: (s: string) => {
        normalizeCalls++;
        return normalizeArabic(s);
      },
    },
    "@/lib/iptv/store": { getCachedPlaylist: () => null },
    "@/lib/iptv/vod": { buildVodLibrary: () => ({ movies, series: [] }) },
    "@/lib/iptv/xtream": {},
    "@/lib/iptv/xtream-vod": {},
    "@/lib/settings": { useSettingsSelector: () => ({ posterScale: 1 }) },
    "@/lib/view": { useScrollMemory() {}, useViewActions: () => ({ openPlayer() {} }) },
    "./live/source-picker": names,
    "./live/playlist-empty": names,
    "./live/hooks/use-iptv-playlist": {
      useIptvPlaylist: () => ({ state: { kind: "ready", playlist: {} }, refresh() {} }),
    },
    "./playlist-vod/series-detail": names,
    "./playlist-vod/use-xtream-vod-library": { useXtreamVodLibrary: () => ({}) },
    "./playlist-vod/use-vod-sources": {
      useVodSources: () => ({ sources: [{ id: "p", kind: "m3u", name: "P" }], activeId: "p" }),
    },
    "./playlist-vod/vod-card": names,
  });
  const shown = () =>
    all(harness.render({ active: true }))
      .filter((n: N) => n.type === "VodCard")
      .map((n) => n.props.title);
  const search = (value: string) => {
    const input = all(harness.render({ active: true })).find((n: N) => n.type === "input");
    assert.ok(input);
    input.props.onChange({ target: { value } });
    normalizeCalls = 0;
    const titles = shown();
    return { titles, normalizeCalls };
  };
  return { shown, search };
}

test("the vod library search normalizes the query and titles instead of raw lowercase", () => {
  const vod = vodHarness(["AR | الدَّم المشـــروك", "Breaking Bad", "مسلسل آخر"]);
  assert.equal(vod.shown().length, 3);
  assert.deepEqual(vod.search(QUERY).titles, ["AR | الدَّم المشـــروك"]);
  assert.deepEqual(vod.search("الدَّم").titles, ["AR | الدَّم المشـــروك"]);
  assert.deepEqual(vod.search("BREAKING").titles, ["Breaking Bad"]);
});

test("vod titles are normalized once, not per keystroke", () => {
  const vod = vodHarness(["الدم المشروك", "Breaking Bad", "مسلسل آخر"]);
  vod.search("ا");
  assert.equal(vod.search("الد").normalizeCalls, 1);
});
