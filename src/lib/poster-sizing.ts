export type PosterRatio = "portrait" | "landscape" | "wide" | "square";

// Width over height for each card shape.
export const RATIO_AR: Record<PosterRatio, number> = {
  portrait: 2 / 3,
  landscape: 16 / 9,
  wide: 16 / 7,
  square: 1,
};

// Height spacer for each shape; WebView2 123 sizes `aspect-ratio` grid items to 0px (harborstremio/harbor#403).
export const ASPECT_PAD: Record<PosterRatio, string> = {
  portrait: "150%",
  landscape: "56.25%",
  wide: "43.75%",
  square: "100%",
};

/** Image width to request for a box, covering its height too when the box is off-aspect. */
export function posterTargetWidth(
  box: { width: number; height: number },
  ratio: PosterRatio,
  devicePixelRatio: number,
  qualityMultiplier: number,
): number {
  if (box.width <= 0) return 0;
  const need = Math.max(box.width, box.height * RATIO_AR[ratio]);
  // An Android TV WebView reports 4 for the panel while it rasterises at 1080p, so the ratio is capped at 2.
  return Math.ceil(need * Math.min(2, devicePixelRatio || 1) * qualityMultiplier);
}
