import { useState } from "react";

function sameKeys(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

// useMemo keyed on explicit keys rather than on what compute reads, which the React Compiler would substitute.
export function useBpKeyed<T>(keys: readonly unknown[], compute: () => T): T {
  const [held, setHeld] = useState(() => ({ keys, value: compute() }));
  if (!sameKeys(held.keys, keys)) {
    const next = { keys, value: compute() };
    setHeld(next);
    return next.value;
  }
  return held.value;
}
