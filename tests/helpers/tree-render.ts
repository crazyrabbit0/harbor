// Compiles a TSX module against a fake React and renders whole component trees, child components included.
import { readFileSync } from "node:fs";
import ts from "typescript";

export type El = { type: any; props: Record<string, any>; key?: unknown; rendered?: unknown };

/** A module whose every export is its own name, so imported components render as named host elements. */
export const named = new Proxy(
  {},
  { get: (_target, key) => (key === "__esModule" ? true : String(key)) },
);

type Slot = { value?: any; deps?: unknown[]; cleanup?: (() => void) | void };

export function treeHarness(
  file: string,
  mocks: Record<string, any>,
  options: {
    globals?: Record<string, any>;
    expose?: string[];
    lenient?: boolean;
    /** Fills a host element's object ref, standing in for the DOM node React would attach. */
    hostNode?: (tag: string, props: Record<string, any>) => unknown;
    /** Leaves lazy modules unloaded, for a test that renders one component without its lazy children. */
    deferLazy?: boolean;
    /** Takes 
eact/jsx-runtime from the mocks like any other import, so a test keeps its own element shape. */
    mockJsx?: boolean;
  } = {},
) {
  const slots: Slot[] = [];
  let cursor = 0;
  let pending: { slot: Slot; run: () => any; deps?: unknown[] }[] = [];
  const contexts = new Map<object, unknown[]>();
  const same = (a?: unknown[], b?: unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const slot = () => (slots[cursor++] ??= {});
  const flat = (children: unknown) => [children].flat(Infinity).filter((c) => c != null);
  const react: Record<string, any> = {
    Fragment: "Fragment",
    Suspense: "Suspense",
    StrictMode: "StrictMode",
    Component: class {},
    memo: (component: any) => component,
    forwardRef: (render: any) => (props: any) => render(props, props.ref ?? null),
    // A lazy component starts loading at once and records the module's default export as `resolved`.
    lazy(load: () => Promise<any>) {
      const component: any = Object.assign(() => null, { load });
      if (!options.deferLazy) load().then((m) => (component.resolved = m.default));
      return component;
    },
    startTransition: (run: () => void) => run(),
    useTransition: () => [false, (run: () => void) => run()],
    useState(initial: any) {
      const s = slot();
      if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial;
      return [
        s.value,
        (next: any) => (s.value = typeof next === "function" ? next(s.value) : next),
      ];
    },
    useReducer(reducer: any, initial: any) {
      const s = slot();
      if (!("value" in s)) s.value = initial;
      return [s.value, (action: any) => (s.value = reducer(s.value, action))];
    },
    useRef(value: any) {
      const s = slot();
      if (!("value" in s)) s.value = { current: value };
      return s.value;
    },
    useMemo(create: () => any, deps?: unknown[]) {
      const s = slot();
      if (!("value" in s) || !same(s.deps, deps)) {
        s.value = create();
        s.deps = deps;
      }
      return s.value;
    },
    useCallback: (fn: any, deps?: unknown[]) => react.useMemo(() => fn, deps),
    useEffect(run: () => any, deps?: unknown[]) {
      const s = slot();
      if (!deps || !same(s.deps, deps)) pending.push({ slot: s, run, deps });
    },
    useLayoutEffect: (run: () => any, deps?: unknown[]) => react.useEffect(run, deps),
    useInsertionEffect: () => {},
    useImperativeHandle: () => {},
    useId: () => ":r:",
    useDeferredValue: (value: any) => value,
    useSyncExternalStore: (_subscribe: any, snapshot: () => any) => snapshot(),
    createContext(value: unknown) {
      const context: any = { __context: true, value };
      context.Provider = { __provider: context };
      return context;
    },
    useContext(context: any) {
      const stack = contexts.get(context);
      return stack?.length ? stack[stack.length - 1] : context.value;
    },
    isValidElement: (node: any) => !!node && typeof node === "object" && "props" in node,
    cloneElement: (el: El, props: Record<string, any>) => ({
      ...el,
      props: { ...el.props, ...props },
    }),
    Children: {
      toArray: flat,
      count: (children: unknown) => flat(children).length,
      map: (children: unknown, fn: (c: unknown, i: number) => unknown) => flat(children).map(fn),
      only: (children: unknown) => flat(children)[0],
    },
  };
  const element = (type: unknown, props: Record<string, any> = {}, key?: unknown) => ({
    type,
    props,
    key,
  });
  const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
  const globals = options.globals ?? {};
  /** Compiles another module against this harness's React, so its hooks share the render pass. */
  function load(path: string, deps: Record<string, any>, expose: string[] = []) {
    const output =
      ts
        .transpileModule(readFileSync(path, "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        })
        .outputText.replaceAll("import.meta.env", "({})") +
      expose.map((name) => `\nexports.${name} = ${name};`).join("");
    const out: Record<string, any> = {};
    new Function("require", "exports", ...Object.keys(globals), output)(
      (name: string) => {
        if (name === "react") return react;
        if (name === "react/jsx-runtime" && !options.mockJsx) return jsx;
        if (name in deps) return deps[name];
        if (options.lenient) return named;
        throw new Error(`Unexpected dependency ${name}`);
      },
      out,
      ...Object.values(globals),
    );
    return out;
  }
  const exports = load(file, mocks, options.expose);

  function expand(node: any): any {
    if (node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(expand);
    const { type, props } = node as El;
    const provider = type && typeof type === "object" && type.__provider;
    if (provider) {
      const stack = contexts.get(provider) ?? [];
      contexts.set(provider, stack);
      stack.push(props.value);
      const children = expand(props.children);
      stack.pop();
      return { type, props: { ...props, children } };
    }
    if (typeof type === "function" && !type.load) return { ...node, rendered: expand(type(props)) };
    if (typeof type === "string" && props.ref && typeof props.ref === "object" && options.hostNode)
      props.ref.current = options.hostNode(type, props);
    return { ...node, props: { ...props, children: expand(props.children) } };
  }

  function commit<T>(build: () => T): T {
    cursor = 0;
    pending = [];
    const result = build();
    const due = pending;
    for (const { slot } of due) slot.cleanup?.();
    for (const effect of due) {
      effect.slot.deps = effect.deps;
      effect.slot.cleanup = effect.run();
    }
    return result;
  }

  return {
    exports,
    load,
    /** Renders a tree from the top, then runs the effects whose dependencies changed. */
    render: (node: unknown) => commit(() => expand(node)),
    /** Calls a hook (or any function using hooks) as one render pass. */
    run: <T>(hook: () => T) => commit(hook),
    unmount() {
      for (const s of slots) s?.cleanup?.();
    },
  };
}

/** Every element in a rendered tree, parents before children. */
export function all(node: unknown): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as El;
  return [el, ...all("rendered" in el ? el.rendered : el.props.children)];
}

/** Elements whose type is the given component or tag. */
export const ofType = (tree: unknown, type: unknown) => all(tree).filter((el) => el.type === type);
