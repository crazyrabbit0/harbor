import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadModule } from "./hook-harness.ts";

type Vars = Record<string, unknown> | undefined;
export type N = { type: any; props: Record<string, any> };

/** A `t` that interpolates like i18n and records every key it was asked for. */
export function makeT() {
  const calls: { key: string; vars: Vars }[] = [];
  const t = (key: string, vars?: Vars) => {
    calls.push({ key, vars });
    return key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name]));
  };
  return { t, calls };
}

/** A DOM-ish element that records class changes, scrolls and pointer capture. */
export function fakeElement() {
  const el = {
    added: [] as string[],
    removed: [] as string[],
    scrolled: 0,
    offsetWidth: 0,
    classList: {
      add: (c: string) => void el.added.push(c),
      remove: (c: string) => void el.removed.push(c),
    },
    scrollIntoView: () => void el.scrolled++,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  };
  return el;
}

// Ref props get a fake element attached the moment the element is created, as React would on commit.
const element = (type: unknown, props: N["props"]) => {
  const ref = props?.ref;
  if (ref && typeof ref === "object" && ref.current == null) ref.current = fakeElement();
  return { type, props };
};
export const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
export const icons = new Proxy({}, { get: (_target, name) => String(name) });

const isNode = (v: unknown): v is N => !!v && typeof v === "object" && "type" in v && "props" in v;

/** Every element in a tree, element-valued props included; components named in `expand` are rendered. */
export function nodes(n: unknown, expand: string[] = []): N[] {
  if (Array.isArray(n)) return n.flatMap((c) => nodes(c, expand));
  if (!isNode(n)) return [];
  const inner = Object.values(n.props ?? {}).flatMap((v) =>
    Array.isArray(v) || isNode(v) ? nodes(v, expand) : [],
  );
  const rendered =
    typeof n.type === "function" && expand.includes(n.type.name)
      ? nodes(n.type(n.props), expand)
      : [];
  return [n, ...inner, ...rendered];
}

export const named = (list: N[], name: string) =>
  list.filter((n) => typeof n.type === "function" && n.type.name === name);

export const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : isNode(n)
        ? text(n.props?.children)
        : "";

/** Compiles a .tsx module with JSX and every import (react included) taken from `mocks`. */
export function loadTsx(
  file: string,
  mocks: Record<string, any>,
  globals: Record<string, any> = {},
): Record<string, any> {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const api: any = {};
  new Function("require", "exports", ...Object.keys(globals), output)(
    (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
    api,
    ...Object.values(globals),
  );
  return api;
}

export type FakeClient = {
  server: { base: string };
  getJson(path: string): Promise<any>;
  getOk(path: string): Promise<boolean>;
  deleteOk(path: string): Promise<boolean>;
  postJson(path: string, body: any): Promise<any>;
  probeStatus(path: string): Promise<number | null>;
};

/** The real Suwayomi model/rest/graphql/transport/api/provider modules over one scripted client. */
export function suwayomiStack(client: FakeClient) {
  const gaps: (number | undefined)[] = [];
  const load = (name: string, mocks: Record<string, unknown>) =>
    loadModule(`src/lib/manga/sources/suwayomi/${name}.ts`, mocks);
  const model = load("model", {
    "@/lib/safe-fetch": {},
    "@/lib/manga/types": { mangaThrottle: () => (fn: () => unknown) => fn() },
    "./base-url": { normalizeSuwayomiBase: (base: string) => base },
    "./auth-registry": { registerSuwayomiAuth: () => {}, suwayomiAuthFor: () => undefined },
  });
  model.makeClient = (_server: unknown, gapMs?: number) => {
    gaps.push(gapMs);
    return client;
  };
  const rest = load("rest", { "./model": model });
  const graphql = load("graphql", {
    "./model": model,
    "./server-message": load("server-message", {}),
  });
  const transport = load("transport", {
    "./model": model,
    "./rest": rest,
    "./graphql": graphql,
    "./auth-registry": { registerSuwayomiSourceBase: () => {} },
  });
  const events = load("source-events", {});
  const api = load("api", {
    "./model": model,
    "./transport": transport,
    "./rest": rest,
    "./graphql": graphql,
    "./base-url": { normalizeExtensionRepoUrl: (url: string) => url },
    "./source-events": events,
  });
  const provider = load("provider", {
    "./model": model,
    "./rest": rest,
    "./graphql": graphql,
    "./transport": transport,
    "./api": api,
    "@/lib/manga/plugins/adapter": { registerServerPageHeaders: () => {} },
    "@/lib/manga/lang-filter": {
      loadMangaLangFilter: () => ["en"],
      langFilterMatches: () => true,
    },
    "./source-events": events,
  }).makeSuwayomiProvider(client.server.base);
  return { model, rest, graphql, transport, events, api, provider, gaps };
}
