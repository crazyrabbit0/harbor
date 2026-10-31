export type SettingsWriteStatus =
  | { ok: true; at: number }
  | { ok: false; error: string; at: number };

const listeners = new Set<() => void>();
let status: SettingsWriteStatus = { ok: true, at: 0 };

export function getSettingsWriteStatus(): SettingsWriteStatus {
  return status;
}

export function subscribeSettingsWriteStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recordSettingsWrite(ok: boolean, error?: string): void {
  const at = Date.now();
  status = ok ? { ok: true, at } : { ok: false, error: error ?? "unknown error", at };
  for (const listener of listeners) listener();
}
