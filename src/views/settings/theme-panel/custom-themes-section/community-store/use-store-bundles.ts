import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { browseBundles, type BundleKind, type StoreBundle } from "@/lib/bundle-store";

const caches: Partial<Record<BundleKind, StoreBundle[]>> = {};

export function useStoreBundles(kind: BundleKind): {
  bundles: StoreBundle[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [tick, setTick] = useState(0);
  const fetchKey = `${kind}:${tick}`;
  const [result, setResult] = useState<{
    key: string;
    bundles: StoreBundle[] | null;
    error: string | null;
  } | null>(() => (caches[kind] ? { key: fetchKey, bundles: caches[kind], error: null } : null));

  useEffect(() => {
    let cancelled = false;
    browseBundles(kind, "top", "")
      .then((list) => {
        if (cancelled) return;
        caches[kind] = list;
        setResult({ key: fetchKey, bundles: list, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setResult((prev) => ({
          key: fetchKey,
          bundles: prev?.key === fetchKey ? prev.bundles : (caches[kind] ?? null),
          error: e instanceof Error ? e.message : t("Could not reach the bundle library."),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, tick, fetchKey]);

  const active = result?.key === fetchKey ? result : null;
  const cached = caches[kind] ?? null;
  const bundles = active ? active.bundles : cached;
  const loading = !active && !cached;
  const error = active?.error ?? null;

  return {
    bundles,
    loading,
    error,
    reload: () => {
      delete caches[kind];
      setTick((t) => t + 1);
    },
  };
}
