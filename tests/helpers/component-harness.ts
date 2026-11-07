import { readFileSync } from "node:fs";
import ts from "typescript";

export type HarnessElement = { type: unknown; props: Record<string, any>; key?: unknown };

const element = (type: unknown, props: Record<string, any> | null, key?: unknown) => ({
  type,
  props: props ?? {},
  key,
});

/** A component that renders nothing; stands in for any child component or icon. */
export const Stub = () => null;

/** A module whose every export is a no-op function (child components, icons, fire-and-forget calls). */
export const stubModule = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (key === "__esModule" ? false : Stub),
  });

/** `react-dom` whose portal renders its child in place. */
export const reactDomInPlace = { createPortal: (node: unknown) => node };

/** Compiles a component with mocked imports on a fake React (lazy, Suspense, providers); effects run after each render. */
export function componentHarness(
  file: string,
  exportName: string,
  mocks: Record<string, any>,
  globals: Record<string, any> = {},
  expose: string[] = [],
) {
  const slots: any[] = [];
  const effects: any[] = [];
  let cursor = 0;
  let pending: { box: any; run: () => any; deps: any[] }[] = [];
  const same = (a: any[] | undefined, b: any[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const slot = (init: () => any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = init();
    return slots[i];
  };
  const react: Record<string, any> = {
    Fragment: "fragment",
    Suspense: "suspense",
    Component: class {},
    lazy: (load: () => unknown) => ({ lazy: load }),
    memo: (component: unknown) => component,
    createContext: (value: unknown) => ({ Provider: "provider", value }),
    useContext: (context: { value: unknown }) => context.value,
    useRef: (value: unknown) => slot(() => ({ current: value })),
    useState(value: unknown) {
      const box = slot(() => ({ value: typeof value === "function" ? value() : value }));
      const set = (next: any) => {
        box.value = typeof next === "function" ? next(box.value) : next;
      };
      return [box.value, set];
    },
    useMemo(create: () => unknown, deps: any[]) {
      const box = slot(() => ({}));
      if (!("value" in box) || !same(box.deps, deps)) Object.assign(box, { deps, value: create() });
      return box.value;
    },
    useCallback: (fn: unknown, deps: any[]) => react.useMemo(() => fn, deps),
    useEffect(run: () => any, deps?: any[]) {
      const box = slot(() => {
        const created = {};
        effects.push(created);
        return created;
      });
      if (!deps || !same(box.deps, deps)) pending.push({ box, run, deps: deps ?? [] });
    },
    useLayoutEffect: (run: () => any, deps?: any[]) => react.useEffect(run, deps),
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useId: () => ":harbor-id:",
  };
  const runtime = { jsx: element, jsxs: element, Fragment: "fragment" };
  const output =
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText + expose.map((name) => `\nexports.${name} = ${name};`).join("");
  const api: Record<string, any> = {};
  new Function("require", "exports", ...Object.keys(globals), output)(
    (name: string) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return runtime;
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
    api,
    ...Object.values(globals),
  );
  return {
    exports: api,
    render(props: Record<string, any> = {}): any {
      cursor = 0;
      pending = [];
      const result = api[exportName](props);
      for (const { box } of pending) if (typeof box.cleanup === "function") box.cleanup();
      for (const { box, run, deps } of pending) Object.assign(box, { deps, cleanup: run() });
      return result;
    },
    unmount() {
      for (const box of effects) if (typeof box.cleanup === "function") box.cleanup();
    },
  };
}

/** Every element of a rendered tree, depth first. */
export function* elements(node: unknown): Generator<HarnessElement> {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
    return;
  }
  const el = node as HarnessElement;
  yield el;
  yield* elements(el.props?.children);
}

export const findElement = (tree: unknown, match: (el: HarnessElement) => boolean) =>
  [...elements(tree)].find(match);
