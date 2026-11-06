import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("profile-background storage reads legacy fractions and clamps percentages", async () => {
  const source = readFileSync(new URL("../src/lib/theme-storage.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let dim = null;
  const db = {
    transaction: () => ({
      objectStore: () => ({
        get: (key) => {
          const request = { result: key === "bg_picker" ? "test-image" : dim };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
      }),
    }),
  };
  const indexedDB = {
    open: () => {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  const module = { exports: {} };
  new Function("module", "exports", "indexedDB", code)(module, module.exports, indexedDB);
  for (const [stored, expected] of [
    [null, 55],
    ["0.55", 55],
    ["55", 55],
    ["0", 0],
    ["1", 1],
    ["100", 100],
    ["120", 100],
    ["-5", 0],
    ["bad", 55],
  ]) {
    dim = stored;
    assert.deepEqual(await module.exports.loadPickerBg(), { image: "test-image", dim: expected });
  }
});

function renderIconsPanel(save) {
  const source = readFileSync(
    new URL("../src/views/settings/icons-panel.tsx", import.meta.url),
    "utf8",
  ).replaceAll("import.meta.glob(", "globStub(");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const element = (type, props) => ({ type, props });
  const mocks = {
    react: { useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect() {}, useRef: () => ({}) },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "./icons": {},
    "@/lib/window": {},
    "@/lib/i18n": { useT: () => (key) => key },
    "@/lib/use-reduced-motion": {},
    "@/components/lottie-player": {},
    "./shared": { Section: "Section" },
    "./kit": { ROW_DESC: "" },
    "./asset-download": {
      AssetDownloadFeedback: "AssetDownloadFeedback",
      useAssetDownload: () => ({ save, savedId: null, pendingId: null, status: null }),
    },
    "@/assets/artists/abiyyu.webp": { default: "a.webp" },
    "@/assets/artists/stass-motion.jpg": { default: "s.jpg" },
    "@/assets/artists/wave.svg": { default: "w.svg" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "globStub", code)(
    (name) => {
      assert.ok(name in mocks, `unexpected import ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
    () => ({}),
  );
  const all = (n) =>
    Array.isArray(n)
      ? n.flatMap(all)
      : n && typeof n === "object"
        ? [n, ...all(n.props?.children)]
        : [];
  const sets = all(module.exports.IconsPanel()).filter((n) => typeof n.type === "function");
  return sets.flatMap((set) => all(set.type(set.props))).filter((n) => n.props?.item);
}

test("subtitle FPS icon is listed in the player set and saves its bundled SVG", async () => {
  const saved = [];
  const tile = renderIconsPanel((...args) => saved.push(args)).find(
    (n) => n.props.item.name === "subtitle-fps",
  );
  assert.ok(tile, "the subtitle FPS tile renders");
  assert.deepEqual(tile.props.item, {
    key: "/player-icons/subtitle-fps.svg",
    name: "subtitle-fps",
    url: "/player-icons/subtitle-fps.svg",
  });
  tile.props.onSave(tile.props.item.key, tile.props.item.name);
  assert.equal(saved.length, 1);
  const [id, fileName, load] = saved[0];
  assert.deepEqual([id, fileName], ["/player-icons/subtitle-fps.svg", "subtitle-fps.svg"]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const file = new URL(`../public${url}`, import.meta.url);
    return { ok: true, text: async () => readFileSync(file, "utf8") };
  };
  try {
    const asset = await load();
    assert.match(asset, /<svg\b/);
    assert.doesNotMatch(asset, /<script\b|onload=|<foreignObject\b/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});
