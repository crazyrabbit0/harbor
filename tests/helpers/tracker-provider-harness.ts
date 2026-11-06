import { readFileSync } from "node:fs";
import ts from "typescript";

/** Renders a tracker provider component (`TraktProvider`, `SimklProvider`) with mocked imports; `render()` returns its context value. */
export function trackerProviderHarness(
  file: string,
  exportName: string,
  mocks: Record<string, any>,
) {
  const refs: any[] = [],
    states: any[] = [],
    memos: any[] = [],
    effects: any[] = [];
  let ri = 0,
    si = 0,
    mi = 0,
    ei = 0;
  let pending: any[] = [];
  const same = (a: any[], b: any[]) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
    useRef(value: any) {
      const i = ri++;
      return (refs[i] ??= { current: value });
    },
    useState(value: any) {
      const i = si++;
      if (!(i in states)) states[i] = typeof value === "function" ? value() : value;
      return [
        states[i],
        (next: any) => {
          states[i] = typeof next === "function" ? next(states[i]) : next;
        },
      ];
    },
    useMemo(create: () => any, deps: any[]) {
      const i = mi++;
      if (!memos[i] || !same(memos[i].deps, deps)) memos[i] = { deps, value: create() };
      return memos[i].value;
    },
    useCallback: (fn: any, deps: any[]) => react.useMemo(() => fn, deps),
    useEffect(run: () => any, deps: any[]) {
      const i = ei++;
      if (!effects[i] || !same(effects[i].deps, deps)) pending.push({ i, run, deps });
    },
  };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const api: any = {};
  new Function("require", "exports", output)((name: string) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (_type: any, props: any) => ({ props }) };
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, api);
  return {
    render() {
      ri = si = mi = ei = 0;
      pending = [];
      const element = api[exportName]({ children: null });
      for (const { i } of pending) effects[i]?.cleanup?.();
      for (const { i, run, deps } of pending) effects[i] = { deps, cleanup: run() };
      return element.props.value;
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
