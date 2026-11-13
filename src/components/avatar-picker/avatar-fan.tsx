import { useMemo, useState } from "react";
import { shuffle } from "@/lib/feed/tags";
import { Shuffle } from "lucide-react";
import { useAvatarValues } from "@/lib/avatars/library";
import { useT } from "@/lib/i18n";

export function AvatarFan({
  onClick,
  onRandomize,
  label,
}: {
  onClick: () => void;
  onRandomize: (value: string) => void;
  label?: string;
}) {
  const t = useT();
  const values = useAvatarValues();
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const picks = useMemo(() => shuffle([...values], seed).slice(0, 5), [values, seed]);
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-edge-soft">
      <button
        type="button"
        onClick={onClick}
        className="group flex flex-1 items-center gap-3 px-2.5 py-1.5 text-start transition-colors hover:bg-canvas/50"
      >
        <span className="flex items-center">
          {picks.map((value, i) => {
            const last = i === picks.length - 1;
            return (
              <span
                key={value.slice(0, 24) + i}
                className="relative -ms-3 block h-9 w-9 shrink-0 first:ms-0"
                style={{ zIndex: i }}
              >
                <span className="block h-full w-full overflow-hidden rounded-full ring-2 ring-canvas">
                  <img
                    src={value}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </span>
                {last && (
                  <span className="absolute -bottom-1 -end-1.5 z-10 rounded-full bg-ink px-1.5 py-px text-[9.5px] font-bold leading-tight text-canvas ring-2 ring-canvas">
                    {values.length}
                  </span>
                )}
              </span>
            );
          })}
        </span>
        <span className="text-start text-[15px] font-medium leading-5 text-ink-muted transition-colors group-hover:text-ink">
          {label ?? t("or use one of our avatars")}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          if (values.length) onRandomize(values[Math.floor(Math.random() * values.length)]);
        }}
        aria-label={t("Random avatar")}
        title={t("Random avatar")}
        className="flex w-10 shrink-0 items-center justify-center self-stretch border-s border-edge-soft text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
      >
        <Shuffle size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}
