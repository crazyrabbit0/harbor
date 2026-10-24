import { createContext, useContext, useEffect, useRef, useState } from "react";
import { SeekBarVisual } from "@/components/player/transport/seek-bar-visual";
import { Tooltip } from "@/components/player/transport/tooltip";
import {
  CONTROL_META,
  type PlayerChromeConfig,
  type PlayerControlId,
  type PlayerSlot,
  type ThemeId,
} from "@/lib/player-chrome";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export function TopRow({
  theme,
  config,
  selectedId,
  onSelect,
  renderOne,
}: {
  theme: ThemeId;
  config: PlayerChromeConfig;
  selectedId: PlayerControlId | null;
  onSelect: (id: PlayerControlId | null) => void;
  renderOne: (id: PlayerControlId) => React.ReactNode;
}) {
  if (theme === "stremio") {
    return (
      <div className="absolute inset-x-0 top-0 z-30 flex h-[88px] items-center justify-between bg-gradient-to-b from-black/35 via-black/15 to-transparent px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SlotZone
            slot="top-left"
            config={config}
            selectedId={selectedId}
            onSelect={onSelect}
            renderOne={renderOne}
          />
        </div>
        <div className="flex items-center gap-1">
          <SlotZone
            slot="top-right"
            config={config}
            selectedId={selectedId}
            onSelect={onSelect}
            renderOne={renderOne}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between bg-gradient-to-b from-black/55 via-black/15 to-transparent px-7 pt-4 pb-8">
      <div className="flex items-start gap-2">
        <SlotZone
          slot="top-left"
          config={config}
          selectedId={selectedId}
          onSelect={onSelect}
          renderOne={renderOne}
        />
      </div>
      <div className="flex items-start gap-2">
        <SlotZone
          slot="top-right"
          config={config}
          selectedId={selectedId}
          onSelect={onSelect}
          renderOne={renderOne}
        />
      </div>
    </div>
  );
}

export function FauxBackdrop({
  width,
  height,
  sizeLabel,
  bg,
}: {
  width: number;
  height: number;
  sizeLabel: string;
  bg: string | null;
}) {
  return (
    <div className="absolute inset-0">
      <CyclingBackdrop bg={bg} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 35% 30%, oklch(0.32 0.10 260 / 0.45) 0%, transparent 60%), radial-gradient(ellipse at 75% 70%, oklch(0.28 0.08 320 / 0.35) 0%, transparent 65%), linear-gradient(180deg, oklch(0.08 0.02 260 / 0.45) 0%, oklch(0.06 0.02 260 / 0.62) 100%)",
        }}
      />
      <div className="absolute inset-x-0 top-[28%] flex flex-col items-center gap-3 text-center opacity-[0.07]">
        <span
          className="font-mono text-[16px] tracking-[0.32em] text-white"
          style={{ fontFeatureSettings: '"tnum" 1' }}
        >
          {width} × {height} · {sizeLabel.toUpperCase()}
        </span>
        <span
          className="text-[180px] font-medium leading-none tracking-tight text-white"
          style={{ fontFamily: '"Fraunces", "Iowan Old Style", "Georgia", serif' }}
        >
          PREVIEW
        </span>
      </div>
    </div>
  );
}

function CyclingBackdrop({ bg }: { bg: string | null }) {
  const [layers, setLayers] = useState<Array<{ url: string; id: number }>>([]);
  const idRef = useRef(0);
  useEffect(() => {
    if (!bg) return;
    let alive = true;
    const show = () => {
      if (!alive) return;
      const id = idRef.current++;
      setLayers((cur) => {
        if (cur.length && cur[cur.length - 1].url === bg) return cur;
        return [...cur, { url: bg, id }].slice(-2);
      });
    };
    const img = new Image();
    img.decoding = "async";
    img.src = bg;
    img.decode().then(show, show);
    return () => {
      alive = false;
    };
  }, [bg]);
  useEffect(() => {
    if (layers.length <= 1) return;
    const tid = setTimeout(() => setLayers((cur) => cur.slice(-1)), 2600);
    return () => clearTimeout(tid);
  }, [layers]);
  return (
    <>
      {layers.map((layer, i) => {
        const isNew = i === layers.length - 1 && layers.length > 1;
        return (
          <img
            key={layer.id}
            src={layer.url}
            alt=""
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: 0.4,
              filter: "saturate(1.15)",
              willChange: "opacity, transform",
              animation: isNew
                ? "harbor-bg-fade 2200ms ease-out both, harbor-bg-drift 30s ease-in-out infinite alternate"
                : "harbor-bg-drift 30s ease-in-out infinite alternate",
            }}
          />
        );
      })}
    </>
  );
}

type LayoutProps = {
  config: PlayerChromeConfig;
  selectedId: PlayerControlId | null;
  onSelect: (id: PlayerControlId | null) => void;
  renderOne: (id: PlayerControlId) => React.ReactNode;
  isLive: boolean;
};

export function DefaultLayout({
  config,
  selectedId,
  onSelect,
  renderOne,
  isLive,
  compact,
  hideSeek,
}: LayoutProps & { compact: boolean; hideSeek?: boolean }) {
  return (
    <>
      {!hideSeek && (
        <div className="flex items-center gap-3">
          {isLive ? (
            <LiveSeekRowMock />
          ) : (
            <>
              <SlotZone
                slot="seek-leading"
                config={config}
                selectedId={selectedId}
                onSelect={onSelect}
                renderOne={renderOne}
              />
              <div className="flex-1">
                <SeekBarPlaceholder />
              </div>
              <SlotZone
                slot="seek-trailing"
                config={config}
                selectedId={selectedId}
                onSelect={onSelect}
                renderOne={renderOne}
              />
            </>
          )}
        </div>
      )}
      <div
        className={`grid items-center ${
          compact ? "grid-cols-[auto_1fr_auto] gap-2" : "grid-cols-[1fr_auto_1fr] gap-4"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <SlotZone
            slot="bottom-left"
            config={config}
            selectedId={selectedId}
            onSelect={onSelect}
            renderOne={renderOne}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <SlotZone
            slot="bottom-center"
            config={config}
            selectedId={selectedId}
            onSelect={onSelect}
            renderOne={renderOne}
          />
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          <SlotZone
            slot="bottom-right"
            config={config}
            selectedId={selectedId}
            onSelect={onSelect}
            renderOne={renderOne}
          />
        </div>
      </div>
    </>
  );
}

export function StremioLayout({
  config,
  selectedId,
  onSelect,
  renderOne,
  isLive,
  hideSeek,
}: LayoutProps & { hideSeek?: boolean }) {
  return (
    <>
      {!hideSeek && (
        <div className="flex h-6 items-center">
          {isLive ? (
            <LiveSeekRowMock />
          ) : (
            <div className="min-w-0 flex-1">
              <SeekBarPlaceholder />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <SlotZone
          slot="bottom-left"
          config={config}
          selectedId={selectedId}
          onSelect={onSelect}
          renderOne={renderOne}
        />
        <SlotZone
          slot="bottom-center"
          config={config}
          selectedId={selectedId}
          onSelect={onSelect}
          renderOne={renderOne}
        />
        <div className="flex-1" />
        <SlotZone
          slot="bottom-right"
          config={config}
          selectedId={selectedId}
          onSelect={onSelect}
          renderOne={renderOne}
        />
      </div>
    </>
  );
}

function LiveSeekRowMock() {
  const { settings } = useSettings();
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
        <span className="h-2 w-2 rounded-full bg-danger" />
        Live
      </span>
      <div className="pointer-events-none relative h-12 flex-1">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <SeekBarVisual settings={settings} pct={92} bufferedPct={95} forceDot />
        </div>
      </div>
      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
        Go to live{" "}
        <span className="ms-0.5 font-mono lowercase tracking-normal text-white/55">· 24s</span>
      </span>
    </>
  );
}

/** "hidden" is the editor's hidden tray; dropping there hides the control. */
export type DropSlot = PlayerSlot | "hidden";
type DropTarget = { slot: DropSlot; beforeId: PlayerControlId | null };
type DragState = { id: PlayerControlId; x: number; y: number; target: DropTarget | null };
type DragApi = {
  drag: DragState | null;
  justDropped: () => boolean;
  begin: (id: PlayerControlId, e: React.PointerEvent) => void;
};

export const DragCtx = createContext<DragApi | null>(null);
const DRAG_THRESHOLD_PX = 6;

// Finds the slot under the pointer and the control the drop lands before, from the slot zones' DOM.
function targetAt(x: number, y: number, draggingId: PlayerControlId): DropTarget | null {
  const zones = Array.from(
    document.querySelectorAll<HTMLElement>("[data-layout-editor] [data-drop-slot]"),
  );
  let zone: HTMLElement | null = null;
  let best = Infinity;
  for (const z of zones) {
    const r = z.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      zone = z;
    }
  }
  if (!zone || best > 48) return null;
  const slot = zone.dataset.dropSlot as DropSlot;
  const items = Array.from(zone.querySelectorAll<HTMLElement>("[data-drag-id]")).filter(
    (el) => el.dataset.dragId !== draggingId,
  );
  const before = items.find((el) => {
    const r = el.getBoundingClientRect();
    return x < r.left + r.width / 2;
  });
  return { slot, beforeId: (before?.dataset.dragId as PlayerControlId | undefined) ?? null };
}

/** Lets controls in the layout editor be dragged between and within slots; a short press still selects. */
export function DragProvider({
  onDrop,
  onSelect,
  children,
}: {
  onDrop: (id: PlayerControlId, slot: DropSlot, beforeId: PlayerControlId | null) => void;
  onSelect: (id: PlayerControlId | null) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ id: PlayerControlId; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const droppedAt = useRef(0);
  dragRef.current = drag;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const cur = dragRef.current;
      if (!cur && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
      setDrag({
        id: p.id,
        x: e.clientX,
        y: e.clientY,
        target: targetAt(e.clientX, e.clientY, p.id),
      });
    };
    const up = () => {
      const cur = dragRef.current;
      pending.current = null;
      if (!cur) return;
      droppedAt.current = performance.now();
      if (cur.target) {
        onDrop(cur.id, cur.target.slot, cur.target.beforeId);
        onSelect(cur.target.slot === "hidden" ? null : cur.id);
      }
      setDrag(null);
    };
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dragRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pending.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", cancel, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", cancel, true);
    };
  }, [onDrop, onSelect]);

  const api: DragApi = {
    drag,
    justDropped: () => performance.now() - droppedAt.current < 250,
    begin: (id, e) => {
      if (e.button !== 0) return;
      pending.current = { id, x: e.clientX, y: e.clientY };
    },
  };
  return (
    <DragCtx.Provider value={api}>
      {children}
      {drag && (
        <div
          className="pointer-events-none fixed z-[400] -translate-x-1/2 -translate-y-[140%] rounded-md bg-accent px-2.5 py-1 text-[13px] font-semibold text-black shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {t(CONTROL_META[drag.id]?.label ?? drag.id)}
        </div>
      )}
    </DragCtx.Provider>
  );
}

function SlotZone({
  slot,
  config,
  selectedId,
  onSelect,
  renderOne,
}: {
  slot: PlayerSlot;
  config: PlayerChromeConfig;
  selectedId: PlayerControlId | null;
  onSelect: (id: PlayerControlId | null) => void;
  renderOne: (id: PlayerControlId) => React.ReactNode;
}) {
  const t = useT();
  const dnd = useContext(DragCtx);
  const allInSlot = config.controls
    .filter((c) => c.slot === slot && !c.hidden)
    .sort((a, b) => a.order - b.order);
  const items = allInSlot
    .map((c) => ({ c, rendered: renderOne(c.id) }))
    .filter(
      (x): x is { c: (typeof allInSlot)[number]; rendered: NonNullable<React.ReactNode> } =>
        x.rendered != null,
    );
  const dragging = dnd?.drag ?? null;
  const target = dragging?.target?.slot === slot ? dragging.target : null;
  if (items.length === 0 && !dragging) return null;
  const marker = (
    <span aria-hidden className="h-9 w-1 shrink-0 self-center rounded-full bg-accent" />
  );
  return (
    <div
      data-drop-slot={slot}
      className={`flex min-h-[44px] items-center gap-[inherit] rounded-lg transition-colors ${
        dragging ? "min-w-[56px] outline-2 outline-dashed outline-white/20" : ""
      } ${target ? "bg-accent/10 outline-accent/70" : ""}`}
    >
      {items.length === 0 && dragging && (
        <span className="px-3 text-[12px] font-medium text-white/45">{t("Drop here")}</span>
      )}
      {items.map(({ c, rendered }) => (
        <span key={c.id} className="contents">
          {target?.beforeId === c.id && dragging?.id !== c.id && marker}
          <ControlPick
            id={c.id}
            tipSide={slot.startsWith("top") ? "bottom" : "top"}
            selected={selectedId === c.id}
            dragging={dragging?.id === c.id}
            onSelect={onSelect}
            onDragStart={dnd?.begin}
          >
            {rendered}
          </ControlPick>
        </span>
      ))}
      {target && target.beforeId == null && items.length > 0 && marker}
    </div>
  );
}

function ControlPick({
  id,
  tipSide,
  selected,
  dragging,
  onSelect,
  onDragStart,
  children,
}: {
  id: PlayerControlId;
  tipSide: "top" | "bottom";
  selected: boolean;
  dragging?: boolean;
  onSelect: (id: PlayerControlId | null) => void;
  onDragStart?: (id: PlayerControlId, e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const dnd = useContext(DragCtx);
  return (
    <Tooltip label={t(CONTROL_META[id]?.label ?? id)} side={tipSide} hidden={!!dnd?.drag}>
      <div
        data-drag-id={id}
        className={`relative cursor-grab rounded-md p-1 transition duration-150 ${
          dragging ? "opacity-35" : ""
        } ${selected ? "bg-accent-soft ring-2 ring-accent" : "ring-2 ring-transparent hover:bg-white/8"}`}
      >
        <div
          inert
          aria-hidden="true"
          data-tv-skip=""
          className="pointer-events-none [&_[role=tooltip]]:hidden"
        >
          {children}
        </div>
        <button
          type="button"
          data-control-id={id}
          data-focusable="true"
          aria-label={t("Edit {label}", { label: t(CONTROL_META[id]?.label ?? id) })}
          aria-pressed={selected}
          data-tv-initial-focus={selected ? "" : undefined}
          onPointerDown={(e) => onDragStart?.(id, e)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // A drag also ends in a click; the drop already selected the control.
            if (dnd?.justDropped()) return;
            onSelect(selected ? null : id);
          }}
          className="pointer-events-auto absolute inset-0 z-10 cursor-grab rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>
    </Tooltip>
  );
}

function SeekBarPlaceholder() {
  const { settings } = useSettings();
  return (
    <div className="pointer-events-none relative h-12 w-full">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <SeekBarVisual settings={settings} pct={21} bufferedPct={28} forceDot />
      </div>
    </div>
  );
}
