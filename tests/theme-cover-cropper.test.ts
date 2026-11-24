import assert from "node:assert/strict";
import test from "node:test";
import { all, treeHarness, type El } from "./helpers/tree-render.ts";

const dir = "src/views/settings/theme-panel/custom-themes-section/theme-upload";

function mount() {
  const observers = new Set<{ cb: () => void }>();
  class FakeResizeObserver {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
  }
  const images: any[] = [];
  class FakeImage {
    naturalWidth = 1920;
    naturalHeight = 1080;
    onload: (() => void) | null = null;
    set src(_url: string) {
      images.push(this);
    }
  }
  const box = { width: 400, height: 225 };
  const frameNode = { getBoundingClientRect: () => ({ ...box }) };
  const picker: any = {};
  const fakeDocument = {
    createElement: (tag: string) => {
      if (tag === "input") return Object.assign(picker, { click() {} });
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {}, imageSmoothingQuality: "" }),
        toBlob: (cb: (b: unknown) => void) => cb("blob"),
      };
    },
  };
  const h = treeHarness(
    `${dir}/cover-cropper.tsx`,
    {
      "@/components/slider": { fillStyle: () => ({}) },
      "../../../icons": { ImagePlus: "ImagePlus", Move: "Move", ZoomIn: "ZoomIn" },
      "@/lib/i18n": { useT: () => (k: string) => k },
      "@/lib/keyboard-navigation/geometry": { getDirection: () => null, isRtl: () => false },
      "@/views/settings/kit": { ROW_ACTION: "row-action" },
      "@/views/settings/shared": { ROW_DESC: "row-desc", ROW_TITLE: "row-title" },
    },
    {
      globals: {
        ResizeObserver: FakeResizeObserver,
        Image: FakeImage,
        document: fakeDocument,
        URL: { createObjectURL: () => "blob:cover" },
        window: { clearTimeout() {}, setTimeout: () => 0 },
      },
    },
  );
  let lastRef: unknown;
  let cleanup: (() => void) | void;
  const render = () => {
    const tree = h.render({ type: h.exports.CoverCropper, props: { onChange() {} } }) as El;
    const frame = all(tree).find((n) => n.type === "div" && typeof n.props.ref === "function")!;
    if (frame.props.ref !== lastRef) {
      cleanup?.();
      lastRef = frame.props.ref;
      cleanup = frame.props.ref(frameNode);
    }
    return tree;
  };
  const loadImage = () => {
    all(render())
      .find((n) => n.type === "button")!
      .props.onClick();
    picker.files = [{}];
    picker.onchange();
    images[0].onload();
  };
  const imgWidth = () => all(render()).find((n) => n.type === "img")!.props.style.width as number;
  const resize = (w: number, h: number) => {
    box.width = w;
    box.height = h;
    for (const ro of observers) ro.cb();
  };
  return {
    render,
    loadImage,
    imgWidth,
    resize,
    observers: () => observers.size,
    unmount: () => cleanup?.(),
  };
}

test("the cover fills the measured frame", () => {
  const c = mount();
  c.render();
  c.loadImage();
  assert.equal(c.imgWidth(), 400);
});

test("the cover follows the frame when it resizes", () => {
  const c = mount();
  c.render();
  c.loadImage();
  c.resize(800, 450);
  assert.equal(c.imgWidth(), 800);
});

test("the frame observer is released when the frame goes away", () => {
  const c = mount();
  c.render();
  assert.equal(c.observers(), 1);
  c.unmount();
  assert.equal(c.observers(), 0);
});
