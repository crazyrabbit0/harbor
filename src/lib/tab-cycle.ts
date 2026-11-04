// Next stop for a Tab trap: wraps both ways and starts from the first stop when focus is outside.
export function nextTabStop<T>(stops: readonly T[], active: T | null, backwards: boolean): T {
  const idx = active === null ? -1 : stops.indexOf(active);
  if (backwards) return idx <= 0 ? stops[stops.length - 1] : stops[idx - 1];
  return idx === -1 || idx === stops.length - 1 ? stops[0] : stops[idx + 1];
}
