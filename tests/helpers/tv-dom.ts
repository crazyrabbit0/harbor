import { load } from "cheerio";

type Rect = { left: number; top: number; width: number; height: number };
type Listener = { fn: (e: any) => void; capture: boolean };

// Cheerio-backed DOM for the TV focus engine; layout comes from data-rect="left,top,width,height".
export function tvDom(html: string, options: { rtl?: boolean } = {}) {
  const $ = load(
    `<html${options.rtl ? ' dir="rtl"' : ""}><head></head><body>${html}</body></html>`,
  );
  const wrapped = new WeakMap<object, El>();
  const listeners = new Map<string, Listener[]>();
  const clicks: El[] = [];
  let hasFocus = true;

  const wrap = (node: any): El | null => {
    if (!node) return null;
    let el = wrapped.get(node);
    if (!el) {
      const tag = String(node.name).toUpperCase();
      el =
        tag === "INPUT" ? new Input(node) : tag === "TEXTAREA" ? new TextArea(node) : new El(node);
      wrapped.set(node, el);
    }
    return el;
  };

  class El {
    readonly nodeType = 1;
    readonly node: any;
    readonly style: Record<string, any> = {
      removeProperty: (name: string) => {
        if (name === "border-radius") this.style.borderRadius = "";
      },
    };
    constructor(node: any) {
      this.node = node;
    }
    get $() {
      return $(this.node);
    }
    get tagName() {
      return String(this.node.name).toUpperCase();
    }
    get isConnected() {
      return this.$.closest("html").length > 0;
    }
    get parentElement() {
      const parent = this.$.parent().get(0);
      return parent && parent.type === "tag" ? wrap(parent) : null;
    }
    get isContentEditable() {
      return this.getAttribute("contenteditable") === "true";
    }
    get tabIndex() {
      const value = this.getAttribute("tabindex");
      return value === null ? 0 : Number(value);
    }
    get dataset() {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(this.node.attribs ?? {})) {
        if (name.startsWith("data-"))
          out[name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = String(value);
      }
      return out;
    }
    get classList() {
      return { contains: (name: string) => this.$.hasClass(name) };
    }
    get scrollHeight() {
      return 0;
    }
    get clientHeight() {
      return 0;
    }
    getAttribute(name: string): string | null {
      return this.$.attr(name) ?? null;
    }
    hasAttribute(name: string) {
      return this.getAttribute(name) !== null;
    }
    setAttribute(name: string, value: string) {
      this.$.attr(name, String(value));
    }
    removeAttribute(name: string) {
      this.$.removeAttr(name);
    }
    toggleAttribute(name: string, force: boolean) {
      if (force) this.setAttribute(name, "");
      else this.removeAttribute(name);
    }
    matches(selector: string) {
      return this.$.is(selector);
    }
    closest(selector: string) {
      return wrap(this.$.closest(selector).get(0));
    }
    querySelector(selector: string) {
      return wrap(this.$.find(selector).get(0));
    }
    querySelectorAll(selector: string) {
      return this.$.find(selector).toArray().map(wrap);
    }
    contains(other: El | null) {
      return !!other && (other === this || this.$.find(other.$).length > 0);
    }
    appendChild(child: El) {
      this.$.append(child.$);
      return child;
    }
    getBoundingClientRect() {
      const own = this.getAttribute("data-rect");
      const [left, top, width, height] = own ? own.split(",").map(Number) : [0, 0, 0, 0];
      const r: Rect = { left, top, width, height };
      return { ...r, right: left + width, bottom: top + height, x: left, y: top };
    }
    getClientRects() {
      return this.getBoundingClientRect().width > 0 ? [this.getBoundingClientRect()] : [];
    }
    focus() {
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
    }
    click() {
      clicks.push(this);
    }
    scrollIntoView() {}
    scrollTo() {}
    scrollBy() {}
  }
  class Input extends El {
    readOnly = false;
    value = "";
    disabled = false;
    get type() {
      return (this.getAttribute("type") || "text").toLowerCase();
    }
    setSelectionRange() {}
  }
  class TextArea extends Input {}
  const tagClass = (tag: string) =>
    ({ [Symbol.hasInstance]: (v: unknown) => v instanceof El && v.tagName === tag }) as any;

  const root = (selector: string) => $(selector).get(0);
  const document: any = {
    documentElement: wrap(root("html")),
    head: wrap(root("head")),
    body: wrap(root("body")),
    activeElement: null as El | null,
    hasFocus: () => hasFocus,
    createElement: (tag: string) => wrap($(`<${tag}></${tag}>`).get(0)),
    querySelector: (selector: string) => wrap($(selector).get(0)),
    querySelectorAll: (selector: string) => $(selector).toArray().map(wrap),
    getElementById: (id: string) => wrap($(`#${id}`).get(0)),
  };
  document.activeElement = document.body;

  const computed = (el: El) => ({
    display: el.closest("[data-display-none]") ? "none" : "block",
    visibility: "visible",
    opacity: "1",
    direction: el.closest('[dir="rtl"]') ? "rtl" : "ltr",
    borderRadius: el.style.borderRadius || "0px",
    getPropertyValue: () => "",
  });
  const window: any = {
    getComputedStyle: computed,
    requestAnimationFrame: (fn: () => void) => (fn(), 0),
    scrollTo() {},
    dispatchEvent() {},
    addEventListener: (
      type: string,
      fn: (e: any) => void,
      opt?: boolean | { capture?: boolean },
    ) => {
      const capture = opt === true || (typeof opt === "object" && !!opt?.capture);
      listeners.set(type, [...(listeners.get(type) ?? []), { fn, capture }]);
    },
    removeEventListener: (type: string, fn: (e: any) => void) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l.fn !== fn),
      );
    },
  };

  const fire = (type: string, init: Record<string, unknown> = {}) => {
    const event = {
      type,
      key: "",
      code: "",
      keyCode: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      defaultPrevented: false,
      stopped: false,
      target: document.activeElement,
      preventDefault() {
        event.defaultPrevented = true;
      },
      stopPropagation() {
        event.stopped = true;
      },
      ...init,
    };
    const all = listeners.get(type) ?? [];
    for (const l of [...all.filter((l) => l.capture), ...all.filter((l) => !l.capture)]) {
      if (event.stopped) break;
      l.fn(event);
    }
    return event;
  };

  return {
    $,
    document,
    window,
    clicks,
    El,
    globals: {
      window,
      document,
      HTMLElement: El,
      HTMLInputElement: tagClass("INPUT"),
      HTMLTextAreaElement: tagClass("TEXTAREA"),
      HTMLSelectElement: tagClass("SELECT"),
      getComputedStyle: computed,
    },
    get: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing element ${selector}`);
      return el as El & { readOnly?: boolean };
    },
    setFocus(value: boolean) {
      hasFocus = value;
    },
    key: (key: string, init: Record<string, unknown> = {}) =>
      fire("keydown", { key, code: key, ...init }),
    fire,
    listenerCount: (type: string) => (listeners.get(type) ?? []).length,
  };
}
