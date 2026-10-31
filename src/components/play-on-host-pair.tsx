import { KeyRound, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";
import { hostPairing } from "@/lib/remote/play-on-route";
import { platformLabel } from "./play-on-lan";

function countdown(expiresAt: number, now: number): string {
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const secs = left % 60;
  return `${Math.floor(left / 60)}:${secs < 10 ? "0" : ""}${secs}`;
}

/** Shows the code another computer must type to pair with this Harbor, while a pairing is open. */
export function PlayOnHostPairDialog() {
  const pairing = hostPairing();
  const pending = useSyncExternalStore(pairing.subscribe, pairing.current, () => null);
  const now = useNow(1000, pending !== null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending && now >= pending.expiresAt) pairing.cancel();
  }, [pairing, pending, now]);

  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pairing.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [pairing, pending]);

  if (!pending) return null;
  return (
    <HostPairPanel pending={pending} now={now} panelRef={panelRef} onCancel={pairing.cancel} />
  );
}

function HostPairPanel({
  pending,
  now,
  panelRef,
  onCancel,
}: {
  pending: NonNullable<ReturnType<ReturnType<typeof hostPairing>["current"]>>;
  now: number;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void;
}) {
  const t = useT();
  const name = pending.peer.name || t("Another computer");
  const shown = `${pending.code.slice(0, 4)}-${pending.code.slice(4)}`;
  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-canvas/75 p-6 backdrop-blur-[3px] animate-fade-in motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("Pair {name} with this Harbor?", { name })}
      onMouseDown={onCancel}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_28px_90px_-30px_rgba(0,0,0,0.9)] ring-1 ring-edge-soft outline-none animate-popover-in motion-reduce:animate-none"
      >
        <header className="flex items-start gap-3 border-b border-edge-soft px-5 py-4">
          <span className="mt-[2px] flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-ink-muted">
            <KeyRound size={19} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-ink">
              {t("Pair {name} with this Harbor?", { name })}
            </h2>
            <p className="truncate text-[12.5px] text-ink-subtle">
              {platformLabel(pending.peer.platform)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("Close")}
            className="-me-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="flex flex-col gap-3.5 px-5 py-5">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {t("Type this code on that computer. Only pair computers you trust.")}
          </p>
          <p
            className="select-all rounded-xl border border-edge bg-canvas/60 py-3 text-center font-mono text-[26px] font-semibold tracking-[0.25em] text-ink"
            aria-live="polite"
          >
            {shown}
          </p>
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="text-[12px] text-ink-subtle">
              {t("Code expires in {left}", { left: countdown(pending.expiresAt, now) })}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="h-11 rounded-xl border border-edge px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
