// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync, readdirSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { sfntFamilyName } from "../src/lib/font-family-name.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import {
  fontFamilyAfterRemoval,
  migrateInlineFonts,
  stripMovedFonts,
} from "../src/lib/settings/custom-fonts.ts";
import { previewFamily } from "../src/views/settings/player-panel/internals.tsx";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");
const indexHtml = read("index.html");
const fetchFonts = read("scripts/fetch-fonts.mjs");

const PRESETS = ["inter", "system", "rounded", "serif", "arabic"];

function bundledFamilies(): Set<string> | null {
  const dir = at("src-tauri/fonts/");
  const out = new Set<string>();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /\.(ttf|otf|ttc)$/i.test(f));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  for (const f of files) {
    const b = readFileSync(new URL(f, dir));
    const name = sfntFamilyName(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    if (name) out.add(name);
  }
  return out;
}

/** The family mpv is told to draw for a settings fragment. */
async function mpvFont(settings: Record<string, unknown>): Promise<string> {
  const props = new Map<string, unknown>();
  const api = loadModule("src/lib/player/sub-style.ts", {
    "@tauri-apps/api/core": {
      invoke: async (_: string, a: { name: string; value: unknown }) => props.set(a.name, a.value),
    },
  });
  await api.applySubStyle({ ...DEFAULT, ...settings });
  return props.get("sub-font") as string;
}

/** The CSS family the in-app subtitle overlay draws for a font id. */
function overlayFamily(id: string): string {
  type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
  const element = (type: unknown, props: N["props"]) => ({ type, props });
  const all = (n: unknown): N[] =>
    Array.isArray(n)
      ? n.flatMap(all)
      : n && typeof n === "object"
        ? [n as N, ...all((n as N).props?.children)]
        : [];
  const nodes = all(
    hookHarness(
      "src/components/player/subtitle-overlay.tsx",
      "SubtitleOverlay",
      {
        "@/lib/profiles": { useActiveKid: () => false },
        "@/lib/settings": {
          useSettingsSelector: (select: (s: unknown) => unknown) =>
            select({ ...DEFAULT, subFontFamily: id }),
        },
        "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      },
      { window: { addEventListener() {}, removeEventListener() {} } },
    ).render({ text: "Line", startSec: 1 }),
  );
  return nodes.map((n) => n.props.style?.fontFamily).find(Boolean);
}

test("every preset maps to a family in mpv, the overlay and the preview", async () => {
  const expected: Record<string, [string, RegExp]> = {
    inter: ["Inter", /^"Inter"/],
    system: ["Segoe UI", /Segoe UI/],
    rounded: ["Fredoka", /^"Fredoka"/],
    serif: ["Times New Roman", /^"Fraunces"/],
    arabic: ["Vazirmatn", /^"Vazirmatn"/],
  };
  for (const id of PRESETS) {
    const [mpv, css] = expected[id];
    assert.equal(await mpvFont({ subFontFamily: id }), mpv, id);
    assert.match(overlayFamily(id), css, `overlay ${id}`);
    assert.match(previewFamily(id), css, `preview ${id}`);
  }
});

test("every family mpv is told to use is provisioned into the bundle", () => {
  for (const family of ["Inter", "Fredoka", "Vazirmatn"]) {
    assert.match(
      fetchFonts,
      new RegExp(`file: "${family}-Variable\\.ttf",[\\s\\S]{0,200}?sha256: "[0-9a-f]{64}"`),
      `fetch-fonts.mjs never fetches ${family}`,
    );
  }
});

test("the fetched font files really carry the family names libass is asked for", () => {
  const bundled = bundledFamilies();
  if (!bundled) return;
  for (const family of ["Inter", "Fredoka", "Vazirmatn", "Noto Sans JP"]) {
    assert.ok(bundled.has(family), `no bundled font is named "${family}" (found: ${[...bundled]})`);
  }
});

test("web font stacks only name families the app actually loads", () => {
  for (const id of PRESETS) {
    assert.doesNotMatch(overlayFamily(id), /Nunito|Quicksand/);
    assert.doesNotMatch(previewFamily(id), /Nunito|Quicksand/);
  }
  for (const family of ["Fredoka", "Vazirmatn", "Inter", "Fraunces"]) {
    assert.match(indexHtml, new RegExp(family), `${family} must be loaded to be usable`);
  }
});

test("a custom font reaches mpv under its real family name", async () => {
  const font = (f: Record<string, unknown>) =>
    mpvFont({ subFontFamily: "custom:a1", customFonts: [{ id: "a1", name: "my-file", ...f }] });
  assert.equal(await font({ family: "Real Family" }), "Real Family", "the internal name wins");
  assert.equal(await font({}), "my-file", "the file name is the fallback");
  assert.equal(await mpvFont({ subFontFamily: "custom:gone", customFonts: [] }), "Inter");
  assert.match(overlayFamily("custom:a1"), /^"harbor-font-a1"/);
  assert.match(previewFamily("custom:a1"), /^"harbor-font-a1"/);
});

function fontPicker(
  options: {
    customFonts?: unknown[];
    loaded?: string[];
    failed?: string[];
    saveFails?: boolean;
  } = {},
) {
  const patches: Record<string, unknown>[] = [];
  const saved: string[] = [];
  const faces: Array<{ family: string; source: unknown }> = [];
  const added: unknown[] = [];
  type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
  const element = (type: unknown, props: N["props"]) => ({ type, props });
  const all = (n: unknown): N[] =>
    Array.isArray(n)
      ? n.flatMap(all)
      : n && typeof n === "object"
        ? [n as N, ...all((n as N).props?.children)]
        : [];
  class FakeFontFace {
    family: string;
    status = "loaded";
    source: unknown;
    constructor(family: string, source: unknown) {
      this.family = family;
      this.source = source;
      faces.push({ family, source });
    }
    async load() {
      return this;
    }
  }
  const loadedFaces = [
    ...(options.loaded ?? []).map((id) => ({ family: `harbor-font-${id}`, status: "loaded" })),
    ...(options.failed ?? []).map((id) => ({ family: `harbor-font-${id}`, status: "error" })),
  ];
  const h = hookHarness(
    "src/views/settings/player-panel/subtitle-section.tsx",
    "FontPicker",
    {
      "@/components/slider": { fillStyle: () => ({}), SliderReset: "SliderReset" },
      "@/lib/settings/defaults": { DEFAULT },
      "../icons": { Plus: "Plus", RotateCcw: "RotateCcw", X: "X" },
      "@/assets/godfather-offer.svg": "still.svg",
      "@/lib/font-family-name": { sfntFamilyName: () => "Parsed Family" },
      "@/lib/font-storage": {
        saveFontData: async (id: string, data: string) => {
          if (options.saveFails) throw new Error("quota");
          saved.push(`${id}:${data.slice(0, 5)}`);
        },
      },
      "@/lib/settings": {
        useSettings: () => ({
          settings: { subFontFamily: "inter", customFonts: options.customFonts ?? [] },
          update: (p: Record<string, unknown>) => patches.push(p),
        }),
      },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/keyboard-navigation": { advanceFocus() {}, captureFocusReturn: () => () => {} },
      "@/components/modal-shell": { ModalShell: "ModalShell", useModalExit: () => ({}) },
      "../color-picker": { ColorPopoverTrigger: "ColorPopoverTrigger" },
      "../shared": { Segmented: "Segmented", ToggleRow: "ToggleRow" },
      "../kit": {
        ROW_ACTION: "",
        ROW_ACTION_DANGER: "",
        ROW_DESC: "",
        SettingGroup: "SettingGroup",
        SettingRow: "SettingRow",
        SettingsWorkbench: "SettingsWorkbench",
      },
      "../page-actions": { usePageActions() {} },
      "./choice": { ChoiceBlock: "ChoiceBlock" },
      "./internals": { previewFamily },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    {
      window: { setTimeout: () => 0, clearTimeout() {} },
      document: {
        fonts: {
          forEach: (fn: (f: unknown) => void) => loadedFaces.forEach(fn),
          ready: Promise.resolve(),
          add: (face: unknown) => added.push(face),
        },
      },
      FontFace: FakeFontFace,
      FileReader: class {
        result: string | null = null;
        onload: (() => void) | null = null;
        readAsDataURL() {
          this.result = "data:font/ttf;base64,AAAA";
          this.onload?.();
        }
      },
      console: { warn() {} },
    },
    ["FontPicker"],
  );
  const render = () => all(h.render());
  return { render, patches, saved, faces, added };
}

test("uploading a font stores its bytes outside the settings blob and registers them directly", async () => {
  const p = fontPicker();
  const input = p.render().find((n) => n.type === "input" && n.props.type === "file")!;
  const bytes = new ArrayBuffer(8);
  input.props.onChange({
    target: {
      files: [{ name: "Fancy.ttf", size: 1000, arrayBuffer: async () => bytes }],
      value: "x",
    },
  });
  await flushPromises();
  assert.equal(p.saved.length, 1, "the bytes go to font storage");
  const patch = p.patches[0] as {
    customFonts: Array<Record<string, unknown>>;
    subFontFamily: string;
  };
  assert.deepEqual(Object.keys(patch.customFonts[0]).sort(), ["family", "format", "id", "name"]);
  assert.deepEqual(
    [patch.customFonts[0].family, patch.customFonts[0].format],
    ["Parsed Family", "truetype"],
  );
  assert.equal(patch.subFontFamily, `custom:${patch.customFonts[0].id}`);
  assert.equal(p.faces[0].source, bytes, "the face is built from bytes, not a data URL");
  assert.equal(p.added.length, 1);
});

test("a font whose bytes could not be stored is not added", async () => {
  const p = fontPicker({ saveFails: true });
  const input = p.render().find((n) => n.type === "input" && n.props.type === "file")!;
  input.props.onChange({
    target: {
      files: [{ name: "Fancy.ttf", size: 1000, arrayBuffer: async () => new ArrayBuffer(8) }],
      value: "",
    },
  });
  await flushPromises();
  assert.deepEqual(p.patches, []);
  assert.ok(
    p
      .render()
      .some((n) => n.type === "p" && /Couldn't save that font/.test(String(n.props.children))),
  );
});

test("a font that failed to load is shown as broken instead of silently falling back", async () => {
  const p = fontPicker({
    customFonts: [
      { id: "ok", name: "Good" },
      { id: "bad", name: "Broken" },
    ],
    loaded: ["ok"],
    failed: ["bad"],
  });
  p.render();
  await flushPromises();
  const button = (label: string) =>
    p
      .render()
      .find(
        (n) =>
          n.props["aria-pressed"] !== undefined && JSON.stringify(n.props.children).includes(label),
      )!;
  assert.match(button("Broken").props.className, /border-danger/);
  assert.ok(button("Broken").props.title);
  assert.doesNotMatch(button("Good").props.className, /border-danger/);
});

test("a settings write that does not persist is not swallowed", async () => {
  const errors: unknown[][] = [];
  const api = loadModule(
    "src/lib/settings/profile-store.ts",
    {
      "@/lib/profile-roster": { activeSettingsSource: () => ({ profileId: "p", linked: false }) },
      "./load": { loadStoredSettings: () => DEFAULT },
      "@/lib/storage-recovery": { setItemWithRecovery: () => false },
      "@/lib/secret-store": {
        getSecret: () => null,
        getSecretsWriteStatus: () => ({ ok: true }),
        secretsDurable: () => true,
        secretsSettled: () => false,
        setSecret() {},
        subscribeSecretsDurable: () => () => {},
      },
      "./secret-fields": {
        SETTINGS_SECRETS_PREFIX: "s",
        TRAKT_LEGACY_MIGRATED_KEY: "t",
        applySecretChanges() {},
        mergeSecrets: (s: unknown) => s,
        missingSecrets: () => [],
        parseSecrets: () => ({}),
        pickSecrets: () => ({}),
        serializeSecrets: () => "{}",
        settingsSecretsKey: () => "k",
        settingsSecretsKeyForBlob: () => "k",
        stripSecrets: (s: unknown) => s,
      },
    },
    {
      console: { error: (...args: unknown[]) => errors.push(args), warn() {} },
      localStorage: { getItem: () => null },
    },
  );
  api.persistEffective(DEFAULT, "p", false);
  assert.equal(errors.length, 1);
});

test("a deleted custom font never strands the font picker", () => {
  const fonts = [{ id: "a1", name: "A", format: "truetype" }];
  assert.equal(fontFamilyAfterRemoval("custom:gone", fonts), "inter");
  assert.equal(fontFamilyAfterRemoval("custom:a1", fonts), null);
  assert.equal(fontFamilyAfterRemoval("serif", []), null);
  const provider = read("src/lib/settings.tsx");
  assert.match(
    provider,
    /fontFamilyAfterRemoval\(settings\.subFontFamily, settings\.customFonts \?\? \[\]\)/,
  );
  assert.match(provider, /migrateInlineFonts\(legacy, saveFontData,/);
  assert.match(provider, /customFonts: stripMovedFonts\(s\.customFonts \?\? \[\], moved\)/);
});

test("a failed font migration never discards the only copy of the font", async () => {
  const fonts = [
    { id: "a", name: "A", format: "truetype", family: "Fam", dataUrl: "data:a" },
    { id: "b", name: "B", format: "woff", dataUrl: "data:b" },
    { id: "c", name: "C", format: "woff2" },
  ];
  const failed: string[] = [];
  const moved = await migrateInlineFonts(
    fonts,
    async (id) => {
      if (id === "b") throw new Error("quota");
    },
    (id) => failed.push(id),
  );
  assert.deepEqual([...moved], ["a"]);
  assert.deepEqual(failed, ["b"]);
  assert.deepEqual(stripMovedFonts(fonts, moved), [
    { id: "a", name: "A", format: "truetype" },
    fonts[1],
    fonts[2],
  ]);
});

test("family-name parsing survives junk instead of guessing", () => {
  assert.equal(sfntFamilyName(new ArrayBuffer(0)), null);
  assert.equal(
    sfntFamilyName(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer),
    null,
  );
});
