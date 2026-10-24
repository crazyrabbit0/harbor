import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Tooltip } from "./tooltip";

export function EpisodeNavBtn({
  direction,
  label,
  tooltip,
  onClick,
  disabled,
  iconOnly,
}: {
  direction: "prev" | "next";
  label: string;
  tooltip?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const Icon = direction === "prev" ? ChevronsLeft : ChevronsRight;
  const button = (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      title={tooltip ? undefined : label}
      className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color] ${
        iconOnly ? "w-11" : "mx-1 gap-1.5 px-3.5"
      } ${
        disabled
          ? "cursor-not-allowed text-white/25"
          : "text-white/90 hover:bg-white/10 hover:text-white"
      }`}
    >
      {direction === "prev" && <Icon size={iconOnly ? 22 : 20} strokeWidth={2.2} />}
      {!iconOnly && <span className="text-[14px] font-medium">{label}</span>}
      {direction === "next" && <Icon size={iconOnly ? 22 : 20} strokeWidth={2.2} />}
    </button>
  );
  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button;
}
