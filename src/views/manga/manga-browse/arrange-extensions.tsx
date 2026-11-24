import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GripVertical, ListOrdered, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { moveItem } from "@/lib/addons-store/reorder";
import { applySuwayomiSourceOrder } from "@/lib/manga/sources/suwayomi/source-order";
import type { SuwayomiSource } from "@/lib/manga/sources/suwayomi/provider";
import { ModalButton, SettingsModal } from "@/views/settings/kit";
import { TRIGGER } from "./filters";
import { sourceDisplayName } from "./all-extensions";

/** How long a row takes to slide into the place it was moved to. */
const SLIDE_MS = 170;

const BTN =
  "flex h-7 w-7 items-center justify-center text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:cursor-default disabled:opacity-25";

/** The two steps as one control, matching the plugins tab's arrange. */
function Stepper({
  name,
  first,
  last,
  onUp,
  onDown,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const t = useT();
  return (
    <span className="flex shrink-0 items-center overflow-hidden rounded-full border border-edge-soft">
      <button
        type="button"
        onClick={onUp}
        disabled={first}
        aria-label={`${t("Move up")} ${name}`}
        className={`${BTN} border-e border-edge-soft`}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={last}
        aria-label={`${t("Move down")} ${name}`}
        className={BTN}
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

/** The row that follows the pointer while one is being moved. Drawn in a portal
 *  on the body so it is not clipped by the panel's own scrolling. */
function DragGhost({
  grab,
  label,
  hint,
}: {
  grab: { x: number; y: number; dx: number; dy: number } | null;
  label: string;
  hint: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setSize((prev) =>
      prev && prev.w === box.width && prev.h === box.height
        ? prev
        : { w: box.width, h: box.height },
    );
  }, [label]);

  if (!grab) return null;
  return createPortal(
    <div
      ref={ref}
      data-drag-ghost
      style={{ left: grab.x - (size?.w ?? 0) / 2, top: grab.y - (size?.h ?? 0) / 2 }}
      className="pointer-events-none fixed z-[300] flex items-center gap-2 rounded-md border border-edge-soft bg-raised px-2 py-1 text-[13.5px] text-ink shadow-[0_16px_40px_-12px_rgba(0,0,0,0.75)]"
    >
      <GripVertical size={14} className="shrink-0 text-ink-subtle/50" />
      <span className="max-w-[280px] truncate">{label}</span>
      <span className="shrink-0 text-[11.5px] text-ink-subtle">{hint}</span>
    </div>,
    document.body,
  );
}

/** Arrange the extensions the way the plugins tab arranges its rows: a modal,
 *  pointer-drag with a floating ghost, rows sliding into place, and an up/down
 *  stepper. */
function ArrangeExtensionsModal({
  sources,
  order,
  onOrder,
  onReset,
  onClose,
}: {
  sources: SuwayomiSource[];
  order: string[];
  onOrder: (ids: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const ordered = applySuwayomiSourceOrder(sources, order);
  const [held, setHeld] = useState<string | null>(null);
  const [grab, setGrab] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const indexOf = (id: string) => ordered.findIndex((s) => s.id === id);

  const move = (from: number, to: number) => {
    const clamped = Math.max(0, Math.min(ordered.length - 1, to));
    if (clamped === from) return;
    onOrder(moveItem(ordered, from, clamped).map((s) => s.id));
  };

  // Rows slide to where they were moved to rather than appearing there.
  const places = useRef(new Map<string, DOMRect>());
  const measured = held ? null : ordered.map((s) => s.id).join("|");

  useLayoutEffect(() => {
    const host = scrollRef.current;
    if (!host || held) return;
    const next = new Map<string, DOMRect>();
    for (const node of host.querySelectorAll<HTMLElement>("[data-arrange-row]")) {
      const id = node.dataset.arrangeRow;
      if (!id) continue;
      const box = node.getBoundingClientRect();
      next.set(id, box);
      const was = places.current.get(id);
      if (!was || node.animate === undefined) continue;
      const dy = was.top - box.top;
      if (!dy) continue;
      node.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: SLIDE_MS,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
    places.current = next;
  }, [measured, held]);

  // A wheel over the panel scrolls it: the rows are pointer-interactive, so the
  // browser leaves them alone, and scrolling while an item is held is the only
  // way to reach a place off-screen.
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      host.scrollTop += e.deltaY;
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  const beginDrag = (e: ReactPointerEvent<HTMLSpanElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    setHeld(id);
    setGrab({
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - (box.left + box.width / 2),
      dy: e.clientY - (box.top + box.height / 2),
    });
    setOver(id);
  };

  // The event target is always the captured handle, so the row being pointed at
  // is read from the coordinates instead.
  const hoverDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!held) return;
    setGrab((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-arrange-row]");
    const id = under instanceof HTMLElement ? (under.dataset.arrangeRow ?? null) : null;
    setOver((prev) => (prev === id ? prev : id));
  };

  const endDrag = () => {
    if (held && over && over !== held) {
      const from = indexOf(held);
      const to = indexOf(over);
      if (from >= 0 && to >= 0) move(from, to);
    }
    setHeld(null);
    setGrab(null);
    setOver(null);
  };

  const reset = () => {
    onReset();
  };

  const heldSource = held ? ordered.find((s) => s.id === held) : undefined;
  const heldLabel = heldSource ? sourceDisplayName(heldSource) : "";

  return (
    <>
      <SettingsModal
        open
        onClose={onClose}
        title={t("Reorder extensions")}
        width={520}
        actions={
          <>
            <ModalButton ghost onClick={reset}>
              <span className="flex items-center gap-2">
                <RotateCcw size={14} />
                {t("Reset")}
              </span>
            </ModalButton>
            <ModalButton onClick={onClose}>{t("Done")}</ModalButton>
          </>
        }
      >
        <div ref={scrollRef} data-arrange-scroll className="max-h-[62vh] overflow-y-auto">
          {ordered.map((source, i) => {
            const name = sourceDisplayName(source);
            const isHeld = held === source.id;
            return (
              <div
                key={source.id}
                data-arrange-row={source.id}
                className={`flex items-center gap-2 rounded-md py-1 pe-2 ps-1 ${
                  isHeld ? "opacity-45" : over === source.id ? "bg-elevated/70" : ""
                }`}
              >
                <span
                  role="presentation"
                  aria-label={t("Drag to reorder")}
                  onPointerDown={(e) => beginDrag(e, source.id)}
                  onPointerMove={hoverDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="flex shrink-0 cursor-grab touch-none select-none items-center text-ink-subtle/50 active:cursor-grabbing"
                >
                  <GripVertical size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{name}</span>
                <Stepper
                  name={name}
                  first={i === 0}
                  last={i === ordered.length - 1}
                  onUp={() => move(i, i - 1)}
                  onDown={() => move(i, i + 1)}
                />
              </div>
            );
          })}
        </div>
      </SettingsModal>
      <DragGhost grab={grab} label={heldLabel} hint={t("Release to place")} />
    </>
  );
}

export function ArrangeExtensions({
  sources,
  order,
  onOrder,
  onReset,
}: {
  sources: SuwayomiSource[];
  order: string[];
  onOrder: (ids: string[]) => void;
  onReset: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={TRIGGER}>
        <ListOrdered size={15} className="text-ink-subtle" />
        <span className="font-medium">{t("Arrange")}</span>
      </button>
      {open && (
        <ArrangeExtensionsModal
          sources={sources}
          order={order}
          onOrder={onOrder}
          onReset={onReset}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
