import { forwardRef } from "react";
import { Circle, MonitorPlay, type LucideIcon } from "lucide-react";
import { SETTINGS_ICON_FILE } from "./settings-icon-map";

const RAW = import.meta.glob("../../assets/settings-icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const BY_FILE: Record<string, string> = {};
for (const [path, body] of Object.entries(RAW)) {
  const file = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");
  BY_FILE[file] = body;
}

// Names with no settings SVG; importing lucide's whole `icons` map would pull every icon into the main bundle.
const LUCIDE_FALLBACK: Record<string, LucideIcon> = { MonitorPlay };

export type SetIconProps = {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  fill?: string;
  color?: string;
  absoluteStrokeWidth?: boolean;
};

function markup(body: string, size: number, strokeWidth?: number | string, fill?: string): string {
  let out = body
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/\swidth="[^"]*"/i, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/i, ` height="${size}"`);
  if (strokeWidth !== undefined) {
    out = out.replace(/\sstroke-width="[^"]*"/i, ` stroke-width="${strokeWidth}"`);
  }
  if (fill !== undefined) {
    out = out.replace(/\sfill="[^"]*"/i, ` fill="${fill}"`);
  }
  return out;
}

export function SetIcon({
  name,
  size = 20,
  strokeWidth,
  className,
  fill,
  color,
}: SetIconProps & { name: string }) {
  const px = typeof size === "string" ? parseFloat(size) || 20 : size;
  const file = SETTINGS_ICON_FILE[name];
  const body = file ? BY_FILE[file] : undefined;
  if (!body) {
    const Fallback = LUCIDE_FALLBACK[name] ?? Circle;
    return (
      <Fallback
        size={px}
        strokeWidth={strokeWidth ?? 1.8}
        className={className}
        fill={fill}
        color={color}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center [&>svg]:block ${className ?? ""}`}
      style={{ width: px, height: px, color }}
      dangerouslySetInnerHTML={{ __html: markup(body, px, strokeWidth, fill) }}
    />
  );
}

export function setIconComponent(name: string): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, SetIconProps>((props, _ref) => (
    <SetIcon name={name} {...props} />
  ));
  Icon.displayName = name;
  return Icon as unknown as LucideIcon;
}
