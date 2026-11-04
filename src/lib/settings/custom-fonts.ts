import type { Settings } from "./types";

type CustomFont = Settings["customFonts"][number];

// A selected custom font that no longer exists falls back to Inter so the picker is never stranded.
export function fontFamilyAfterRemoval(family: string, fonts: CustomFont[]): string | null {
  if (!family?.startsWith("custom:")) return null;
  const id = family.slice("custom:".length);
  return fonts.some((f) => f.id === id) ? null : "inter";
}

// Moves inline font bytes to storage; a font whose write fails keeps its only copy inline.
export async function migrateInlineFonts(
  fonts: CustomFont[],
  save: (id: string, dataUrl: string) => Promise<void>,
  onError: (id: string, error: unknown) => void,
): Promise<Set<string>> {
  const moved = new Set<string>();
  for (const f of fonts) {
    if (!f.dataUrl) continue;
    try {
      await save(f.id, f.dataUrl);
      moved.add(f.id);
    } catch (e) {
      onError(f.id, e);
    }
  }
  return moved;
}

export function stripMovedFonts(fonts: CustomFont[], moved: Set<string>): CustomFont[] {
  return fonts.map((f) => (moved.has(f.id) ? { id: f.id, name: f.name, format: f.format } : f));
}
