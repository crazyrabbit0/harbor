// Runs read() keyed on values it does not otherwise read (store versions), so a compiled memo still recomputes on them.
export function readAtVersion<T>(_version: unknown, read: () => T): T {
  return read();
}
