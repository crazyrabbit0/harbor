import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const hasTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let cached: Promise<string | null> | null = null;

/** The host's web remote pairing key; null outside Tauri or when the command fails. */
export function loadWebRemoteKey(): Promise<string | null> {
  if (!hasTauri) return Promise.resolve(null);
  cached ??= invoke<string>("web_remote_token").catch(() => {
    cached = null;
    return null;
  });
  return cached;
}

/** undefined while loading, then the key or null. */
export function useWebRemoteKey(): string | null | undefined {
  const [key, setKey] = useState<string | null | undefined>(hasTauri ? undefined : null);
  useEffect(() => {
    let alive = true;
    void loadWebRemoteKey().then((k) => {
      if (alive) setKey(k);
    });
    return () => {
      alive = false;
    };
  }, []);
  return key;
}
