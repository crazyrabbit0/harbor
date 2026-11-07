// Runs the real `useNavDrag` (chrome/nav-edit.tsx) against a small fake nav strip laid out by rects.
import { treeHarness } from "./tree-render.ts";

type Box = { left: number; top: number; width: number; height: number };

export function navDragHarness(options: {
  navItems: Record<string, any>;
  ids: string[];
  boxes: Box[];
  rtl?: boolean;
  reducedMotion?: boolean;
}) {
  let editing = true;
  const commits: any[] = [];
  const mediaQueries: string[] = [];
  const animations: unknown[] = [];
  const listeners: { type: string; fn: (e: any) => void }[] = [];
  const ghost: Record<string, any> = {
    inert: false,
    style: {},
    removed: false,
    removeAttribute() {},
    setAttribute() {},
    remove() {
      ghost.removed = true;
    },
  };
  const nav: Record<string, any> = { dir: options.rtl ? "rtl" : "ltr", closest: () => null };
  const kids = options.ids.map((id, i) => {
    const box = options.boxes[i];
    const el: Record<string, any> = {
      dataset: { navDropId: id },
      style: {},
      parentElement: nav,
      getBoundingClientRect: () => ({
        ...box,
        right: box.left + box.width,
        bottom: box.top + box.height,
      }),
      closest: (selector: string) =>
        selector === "nav" ? nav : selector === "[data-nav-drop-id]" ? el : null,
      animate: (frames: unknown) => animations.push(frames),
      cloneNode: () => ghost,
    };
    return el;
  });
  nav.querySelectorAll = () => kids;
  const hit = (x: number, y: number) =>
    kids.find((k) => {
      const r = k.getBoundingClientRect();
      return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
    }) ?? null;
  const document = {
    body: { style: {}, appendChild() {} },
    elementFromPoint: hit,
  };
  const window = {
    addEventListener: (type: string, fn: (e: any) => void) => listeners.push({ type, fn }),
    removeEventListener: (type: string, fn: (e: any) => void) => {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    setTimeout: () => 0,
    matchMedia: (query: string) => {
      mediaQueries.push(query);
      return { matches: !!options.reducedMotion };
    },
  };
  const navCustomization = { order: [], hidden: [], renamed: {} };
  const h = treeHarness(
    "src/chrome/nav-edit.tsx",
    {
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => unknown) => pick({ navCustomization }),
        useSettingsUpdate: () => (patch: { navCustomization: unknown }) =>
          commits.push(patch.navCustomization),
      },
      "./nav-items": options.navItems,
      "./nav-edit-mode": { useNavEditMode: () => editing, setNavEditMode() {} },
    },
    {
      lenient: true,
      globals: {
        window,
        document,
        getComputedStyle: (el: { dir?: string }) => ({ direction: el.dir ?? "ltr" }),
        MouseEvent: class {},
      },
    },
  );
  const fire = (type: string, event: Record<string, unknown>) => {
    for (const l of listeners.filter((entry) => entry.type === type)) l.fn(event);
  };
  const orientation = options.rtl === undefined ? "vertical" : "horizontal";
  const render = () => h.run(() => h.exports.useNavDrag(options.ids[0], orientation));
  let drag = render();
  const center = (i: number) => {
    const r = kids[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return {
    kids,
    ghost,
    commits,
    mediaQueries,
    animations,
    listenerCount: () => listeners.length,
    listenerTypes: () => listeners.map((l) => l.type),
    unmount: () => h.unmount(),
    /** Presses the first item, then moves the pointer to (x, y). */
    dragTo(x: number, y: number) {
      const start = center(0);
      drag.onPointerDown({
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
        currentTarget: kids[0],
      });
      fire("pointermove", { pointerId: 1, clientX: x, clientY: y });
    },
    drop: () => fire("pointerup", { pointerId: 1 }),
    setEditing(next: boolean) {
      editing = next;
      drag = render();
    },
    center,
  };
}
