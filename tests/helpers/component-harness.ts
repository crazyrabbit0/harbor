import { treeHarness } from "./tree-render";

export type HarnessElement = { type: unknown; props: Record<string, any>; key?: unknown };

/** A component that renders nothing; stands in for any child component or icon. */
export const Stub = () => null;

/** A module whose every export is a no-op function (child components, icons, fire-and-forget calls). */
export const stubModule = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (key === "__esModule" ? false : Stub),
  });

/** `react-dom` whose portal renders its child in place. */
export const reactDomInPlace = { createPortal: (node: unknown) => node };

/** Renders one component's own output (child components stay unexpanded) on the shared fake React of `tree-render.ts`. */
export function componentHarness(
  file: string,
  exportName: string,
  mocks: Record<string, any>,
  globals: Record<string, any> = {},
  expose: string[] = [],
) {
  const harness = treeHarness(file, mocks, { globals, expose, deferLazy: true });
  return {
    exports: harness.exports,
    render: (props: Record<string, any> = {}): any =>
      harness.run(() => harness.exports[exportName](props)),
    unmount: () => harness.unmount(),
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
