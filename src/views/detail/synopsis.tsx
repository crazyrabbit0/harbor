import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

export function Synopsis({ text }: { text: string }) {
  const t = useT();
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [toggleFor, setToggleFor] = useState<string | null>(null);
  const expanded = expandedFor === text;
  const showToggle = toggleFor === text;
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      // oxlint-disable-next-line react/set-state-in-effect -- measures clamped text overflow from DOM geometry
      setToggleFor(text);
    }
    const ro = new ResizeObserver(() => {
      if (el.scrollHeight > el.clientHeight + 1) setToggleFor(text);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className="max-w-3xl">
      <p
        ref={ref}
        data-tauri-drag-region="false"
        className={`text-[16px] leading-relaxed text-ink-muted ${expanded ? "" : "line-clamp-4"}`}
      >
        {text}
      </p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpandedFor((cur) => (cur === text ? null : text))}
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          {expanded ? t("Show less") : t("Show more")}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
