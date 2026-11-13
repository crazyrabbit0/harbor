// @ts-nocheck -- Node component-boundary tests are outside the browser tsconfig.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { experimentalReleaseNote } from "../src/lib/updater/experimental-notes.ts";
import { XrayRailCard, XrayTile } from "../src/components/player/xray/xray-actor-card.tsx";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, jsx as treeJsx, names } from "./helpers/plugin-ui-tree.ts";

// Execute production component logic with only hooks and external boundaries stubbed.
// No credentials, real player, network requests or persistent storage are used.
function component(path, overrides = {}) {
  let cursor = 0;
  const state = [];
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [
        state[i],
        (value) => {
          state[i] = typeof value === "function" ? value(state[i]) : value;
        },
      ];
    },
    useEffect() {},
    useLayoutEffect() {},
    useRef: () => ({ current: null }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn(),
    useId: () => "notes-title",
    lazy: () => "LazyPanel",
    Suspense: "Suspense",
  };
  const modules = {
    react: hooks,
    "react/jsx-runtime": jsx,
    "@/lib/i18n": { useT: () => (s) => s },
    "@/lib/build-info": { APP_VERSION: "0.999.4" },
    "@/lib/updater/experimental-notes": { experimentalReleaseNote },
    "@/lib/queue": { useQueue: () => [] },
    ...overrides,
  };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function("require", "exports", "document", outputText)(
    (id) => modules[id] ?? new Proxy({}, { get: (_, key) => String(key) }),
    exports,
    { body: "body" },
  );
  return {
    render(name, props) {
      cursor = 0;
      return exports[name](props);
    },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test("installed experimental notes are exact-version, organized and offline", () => {
  const note = experimentalReleaseNote("0.999.4");
  assert.equal(note.title, "Harbor Experimental 0.0.4");
  assert.ok(note.sections.some((s) => s.heading === "Please test"));
  assert.match(JSON.stringify(note), /X-Ray/);
  for (const version of [
    null,
    undefined,
    "dev",
    "0.9.124",
    "0.9.125",
    "0.999.3",
    "0.999.5",
    "__proto__",
    "constructor",
  ]) {
    assert.equal(experimentalReleaseNote(version), null);
  }
});

test("installed notes open without an account or an available update", () => {
  const app = component("src/components/update/experimental-changelog.tsx");
  const before = nodes(app.render("ExperimentalChangelog"));
  const button = before.find((n) => n.type === "button");
  assert.equal(button.props.children, "View experimental changelog");
  button.props.onClick({ currentTarget: { focus() {} } });
  const dialog = nodes(app.render("ExperimentalChangelog")).find((n) => n.props?.note);
  assert.equal(dialog.props.note.title, "Harbor Experimental 0.0.4");
  dialog.props.onClose();
  assert.equal(
    nodes(app.render("ExperimentalChangelog")).some((n) => n.props?.note),
    false,
  );
  const beta = component("src/components/update/experimental-changelog.tsx", {
    "@/lib/build-info": { APP_VERSION: "0.9.125" },
  });
  assert.equal(beta.render("ExperimentalChangelog"), null);
});

test("experimental update notes remain visible during and after download", () => {
  const update = {
    channel: "experimental",
    version: "0.999.4",
    notes: "Tester notes",
    progress: 0,
    totalBytes: 0,
  };
  const app = component("src/components/update/update-card.tsx", {
    "@/lib/updater/use-update": { useUpdate: () => update },
  });
  for (const status of ["available", "downloading", "downloaded"]) {
    update.status = status;
    assert.ok(
      nodes(app.render("UpdateCard")).some(
        (n) => n.props?.note?.title === "Harbor Experimental 0.0.4",
      ),
      status,
    );
  }
});

for (const Card of [XrayRailCard, XrayTile]) {
  test(`${Card.name} opens the exact actor only on activation`, () => {
    const person = { id: 123, name: "Test Actor", sub: "Character", profilePath: null };
    const opened = [];
    const card = Card({ person, onOpenPerson: (p) => opened.push(p) });
    assert.equal(card.type, "button");
    assert.equal(card.props.type, "button");
    assert.match(card.props.className, /focus-visible/);
    assert.equal(card.props.onFocus, undefined);
    assert.deepEqual(opened, []);
    card.props.onClick();
    assert.deepEqual(opened, [person]);
  });
}

test("actor browser starts at selected person and browses titles within the player", () => {
  const app = component("src/components/player/cast-modal.tsx");
  const props = {
    open: true,
    meta: { id: "tt123", name: "Playing title" },
    initialPerson: { id: 42, name: "Actor" },
    tmdbKey: null,
    onClose() {},
  };
  let tree = nodes(app.render("CastModal", props));
  const person = tree.find((n) => n.type === "PersonPanel");
  assert.equal(person.props.personId, 42);
  assert.equal(tree.find((n) => n.props?.role === "dialog").props["aria-modal"], "true");
  person.props.onOpenTitle({ id: "tt456", name: "Other movie" });
  tree = nodes(app.render("CastModal", props));
  const title = tree.find((n) => n.type === "TitlePanel");
  assert.equal(title.props.meta.id, "tt456");
  assert.equal(title.props.onPlay, undefined);
  assert.equal(title.props.onOpenDetail, undefined);
  const normal = component("src/components/player/cast-modal.tsx");
  assert.ok(
    nodes(normal.render("CastModal", { ...props, initialPerson: undefined })).some(
      (n) => n.type === "TitlePanel",
    ),
  );
});

const xray = (name, overrides = {}) =>
  component(`src/components/player/xray/${name}.tsx`, { "@/lib/i18n": i18n, ...overrides });
const i18n = { useT: () => (s) => s };
const actor = { id: 7, name: "Scene Actor", sub: "Role", profilePath: null };

test("X-Ray rail, scene and cast grid all forward actor activation", () => {
  const overlay = xray("xray-overlay", {
    "@/lib/settings": {
      useSettingsSelector: (pick) => pick({ tmdbKey: "k", xrayEnabled: true, xrayLiveScan: false }),
    },
    "@/lib/face/use-face-id": {
      useFaceId: () => ({
        people: [],
        ready: true,
        galleryReady: true,
        progress: { done: 0, total: 0 },
        error: null,
      }),
    },
    "@/lib/xray/use-xray-cast": { useXrayCast: () => ({ cast: [], details: null }) },
    "@/lib/visibility": { usePageVisible: () => true },
  });
  const props = { meta: { id: "tt1", name: "Film" }, visible: true, isPaused: true };
  const draw = () => nodes(overlay.render("XrayOverlay", props));
  draw()
    .find((n) => n.type === "button")
    .props.onClick();
  const opened = (tree) => tree.find((n) => n.type === "CastModal")?.props.initialPerson;
  draw()
    .find((n) => n.type === "XrayRail")
    .props.onOpenPerson(actor);
  assert.equal(opened(draw()), actor, "the rail opens the actor browser");
  const other = { ...actor, id: 8 };
  draw()
    .find((n) => n.type === "XrayRail")
    .props.onViewAll();
  draw()
    .find((n) => n.type === "XrayBrowser")
    .props.onOpenPerson(other);
  assert.equal(opened(draw()), other, "the full browser opens the actor browser");

  const activated = [];
  const open = (p) => activated.push(p);
  const cards = (tree, type) => nodes(tree).filter((n) => n.type === type);
  const forwards = (card) => {
    activated.length = 0;
    card.props.onOpenPerson(card.props.person ?? actor);
    return activated.length === 1;
  };
  const rail = xray("xray-rail").render("XrayRail", {
    people: [actor],
    ready: true,
    galleryReady: true,
    progress: { done: 1, total: 1 },
    error: null,
    onOpenPerson: open,
    onViewAll() {},
    onClose() {},
  });
  assert.ok(forwards(cards(rail, "XrayRailCard")[0]), "rail");
  const scene = xray("xray-scene").render("XrayScene", {
    people: [actor],
    showName: "Film",
    onOpenPerson: open,
  });
  assert.ok(forwards(cards(scene, "XrayTile")[0]), "scene");

  const browser = xray("xray-browser");
  const browserProps = {
    meta: { id: "tt1", name: "Film" },
    details: { cast: [{ id: 9, name: "Cast", character: "C", profilePath: null }], crew: [] },
    people: [actor],
    onOpenPerson: open,
    onClose() {},
  };
  let tree = nodes(browser.render("XrayBrowser", browserProps));
  assert.ok(forwards(tree.find((n) => n.type === "XrayScene")), "browser scene tab");
  tree.find((n) => n.type === "button" && n.props.children[0] === "Cast").props.onClick();
  tree = nodes(browser.render("XrayBrowser", browserProps));
  const grid = tree.find((n) => typeof n.type === "function" && n.props.people);
  assert.ok(forwards(cards(grid.type(grid.props), "XrayTile")[0]), "browser cast grid");
});

test("notes and actor browser register with Harbor's Back navigation", () => {
  const isBackKey = { isBackKey: (e) => e.key === "Escape" };
  const notes = component("src/components/update/experimental-changelog.tsx", {
    "react-dom": { createPortal: (node) => node },
    "@/lib/keyboard-navigation/geometry": isBackKey,
  });
  nodes(notes.render("ExperimentalChangelog"))
    .find((n) => n.type === "button")
    .props.onClick({ currentTarget: { focus() {} } });
  const dialogElement = nodes(notes.render("ExperimentalChangelog")).find((n) => n.props?.note);
  let closed = 0;
  const dialog = nodes(dialogElement.type({ ...dialogElement.props, onClose: () => closed++ }));
  const scope = dialog.find((n) => n.type === "dialog");
  assert.equal(scope.props["data-tv-focus-scope"], true);
  const close = dialog.find((n) => n.props?.["data-tv-modal-close"] === true);
  close.props.onClick();
  assert.equal(closed, 1, "the Back target closes the notes");
  const key = { preventDefault() {}, stopPropagation() {} };
  scope.props.onKeyDown({ ...key, nativeEvent: { key: "Escape" } });
  assert.equal(closed, 2, "Back closes the notes");

  const cast = component("src/components/player/cast-modal.tsx", {
    "@/lib/keyboard-navigation/geometry": isBackKey,
  });
  let closes = 0;
  const props = {
    open: true,
    meta: { id: "tt1", name: "Film" },
    initialPerson: { id: 42, name: "Actor" },
    tmdbKey: null,
    onClose: () => closes++,
  };
  let tree = nodes(cast.render("CastModal", props));
  assert.equal(tree.find((n) => n.props?.role === "dialog").props["data-tv-focus-scope"], true);
  tree.find((n) => n.props?.["data-tv-modal-close"] === "").props.onClick();
  assert.equal(closes, 1, "at the root the Back target closes the browser");
  tree.find((n) => n.type === "PersonPanel").props.onOpenTitle({ id: "tt2", name: "Other" });
  tree = nodes(cast.render("CastModal", props));
  const back = tree.filter((n) => n.props?.["data-tv-modal-close"] != null);
  assert.equal(back.length, 1);
  back[0].props.onClick();
  assert.equal(
    nodes(cast.render("CastModal", props)).some((n) => n.type === "PersonPanel"),
    true,
  );
  assert.equal(closes, 1, "deeper in, the Back target steps back instead of closing");
});

function updatesPanel(supportsInAppUpdates) {
  const h = hookHarness(
    "src/views/settings/updates-panel.tsx",
    "UpdatesPanel",
    {
      "react/jsx-runtime": treeJsx,
      "@/lib/i18n": i18n,
      "@/components/update/experimental-changelog": names,
      "@/lib/updater/in-app-updates": { useInAppUpdatesSupported: () => supportsInAppUpdates },
      "./shared": { Section: "Section" },
      "./advanced-panel": names,
      "./rollback-row": names,
      "./build-feedback": names,
      "./backup-row": names,
      "./settings-recover-row": names,
      "./experimental-builds-section": names,
      "@/lib/updater/beta-return": { readBetaReturnContext: () => null },
      "@/lib/updater/experimental-access": { useExperimentalAccess: () => false },
    },
    { __APP_VERSION__: "0.999.4" },
  );
  return all(h.render()).map((n) => (n.type === "Section" ? n.props.title : n.type));
}

test("installed notes sit above the Updates section, even without in-app updates", () => {
  const order = updatesPanel(true);
  assert.ok(order.indexOf("ExperimentalChangelog") >= 0);
  assert.ok(order.indexOf("ExperimentalChangelog") < order.indexOf("Updates"));
  assert.ok(updatesPanel(false).includes("ExperimentalChangelog"));
});
