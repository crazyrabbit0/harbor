// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as language from "../src/lib/subtitles/language";
import { normalizeLang } from "../src/lib/subtitles/language";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all } from "./helpers/subtitle-addon-harness.ts";

const element = (type: unknown, props: Record<string, any>) => ({ type, props });
const noop = () => {};

/** Renders the audio menu body; each render returns the header count, search input and listed tracks. */
function menuBody(tracks: Record<string, unknown>[]) {
  const h = hookHarness(
    "src/components/player/audio-menu.tsx",
    "MenuBody",
    {
      "lucide-react": new Proxy({}, { get: (_target, name) => String(name) }),
      "@tauri-apps/api/event": { listen: async () => noop },
      "@/components/flag": { Flag: "Flag" },
      "@/lib/modal-overlay": {
        modalOverlayClose: async () => {},
        modalOverlayEmitState: async () => {},
        modalOverlayOpen: async () => {},
      },
      "@/lib/subtitles/language": language,
      "@/lib/i18n": { useT: () => (key: string) => key },
      "./menu-side": { useMenuSide: () => ({ measure: noop }) },
      "./transport/tooltip": { Tooltip: "Tooltip" },
      "./transport/hotkey-label": { withHotkey: (s: string) => s },
      "@/lib/player/overlay-dismiss": { watchOutsideMouseDown: () => noop },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    {},
    ["MenuBody"],
  );
  const props = {
    tracks,
    selectedId: null,
    delaySec: 0,
    engine: "mpv",
    onSelect: noop,
    onDelay: noop,
    onClose: noop,
  };
  const view = () => {
    const nodes = all(h.render(props));
    const count = nodes.find((n) =>
      String(n.props.className ?? "").includes("tabular-nums text-ink-subtle"),
    );
    const section = nodes.find((n) => typeof n.type === "function" && "tracks" in n.props);
    return {
      count: count?.props.children,
      input: nodes.find((n) => n.type === "input"),
      ids: (section?.props.tracks ?? []).map((track: { id: string }) => track.id),
    };
  };
  return {
    view,
    search(query: string) {
      view().input?.props.onChange({ target: { value: query } });
      return view();
    },
  };
}

const dubs = [
  { id: "en", lang: "en", title: "English" },
  { id: "fr", lang: "fr", title: "Français" },
  { id: "ar", lang: "ar", title: "Arabic Dub" },
  { id: "ja", lang: "ja", title: "Japanese" },
  { id: "de", lang: "de", title: "Deutsch" },
];

test("a language typed in its own script resolves to its code", () => {
  // The request came from someone looking for an Arabic dub; Gulf and Russian are the
  // two largest audiences, and neither types "Arabic" or "Russian" first.
  assert.equal(normalizeLang("العربية"), "ar");
  assert.equal(normalizeLang("عربي"), "ar");
  assert.equal(normalizeLang("русский"), "ru");
  assert.equal(normalizeLang("日本語"), "ja");
  assert.equal(normalizeLang("한국어"), "ko");
  assert.equal(normalizeLang("中文"), "zh");
  assert.equal(normalizeLang("türkçe"), "tr");
  assert.equal(normalizeLang("tiếng việt"), "vi");
});

test("native names fold through the same path as codes and English names", () => {
  for (const written of ["ar", "ara", "Arabic", "العربية"]) {
    assert.equal(normalizeLang(written), "ar", `"${written}" should reach ar`);
  }
  for (const written of ["ru", "rus", "Russian", "Русский"]) {
    assert.equal(normalizeLang(written), "ru", `"${written}" should reach ru`);
  }
});

test("adding native names did not disturb the existing region rules", () => {
  assert.equal(normalizeLang("pt-br"), "pt-br");
  assert.equal(normalizeLang("es-MX"), "es-419");
  assert.equal(normalizeLang("in"), "id");
  assert.equal(normalizeLang(""), "");
});

test("the menu only offers search once a list is worth searching", () => {
  assert.equal(menuBody(dubs.slice(0, 4)).view().input, undefined);
  assert.ok(menuBody(dubs).view().input);
});

test("the match is diacritic-insensitive and language-aware", () => {
  const menu = menuBody([...dubs, { id: "cmt", title: "Café Commentary" }]);
  assert.deepEqual(menu.search("cafe commentary").ids, ["cmt"]);
  assert.deepEqual(menu.search("العربية").ids, ["ar"]);
  assert.deepEqual(menu.search("Japanese").ids, ["ja"]);
});

test("the header count reflects the filtered list, not the whole file", () => {
  // The subtitle menu shipped the opposite of this and it read as a bug.
  const menu = menuBody(dubs);
  assert.equal(menu.view().count, 5);
  assert.equal(menu.search("deutsch").count, 1);
});
