// A mocked `react/jsx-runtime` plus walkers, so a component's returned tree can be read in a test.
export type N = { type: unknown; props: Record<string, any> & { children?: unknown } };

const element = (type: unknown, props: N["props"]) => ({ type, props });

export const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };

/** Every element in the tree, parents before children, in render order. */
export const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

/** The string children under a node, joined; elements contribute only their own children. */
export const text = (n: unknown): string =>
  typeof n === "string"
    ? n
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

/** A module whose every export is its own name, so a component renders as an element named for it. */
export const names = new Proxy({}, { get: (_target, name) => String(name) });

/** A translator that keeps the key and the variables visible. */
export const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}|${JSON.stringify(vars)}` : key;
