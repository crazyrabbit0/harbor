import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n";

export function Synopsis({ text }: { text: string }) {
  const t = useT();
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [toggleFor, setToggleFor] = useState<string | null>(null);
  const expanded = expandedFor === text;
  const showToggle = toggleFor === text;

  // Measured from the ref callback, which runs at commit like a layout effect, so the toggle never flashes.
  const measure = useCallback(
    (el: HTMLParagraphElement | null) => {
      if (!el || expanded) return;
      const check = () => {
        if (el.scrollHeight > el.clientHeight + 1) setToggleFor(text);
      };
      check();
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [text, expanded],
  );

  return (
    <div className="max-w-3xl">
      <p
        ref={measure}
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
