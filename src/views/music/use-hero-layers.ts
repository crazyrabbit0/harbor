import { useEffect, useState } from "react";

type Layer = { id: number; src: string };

let seq = 0;
const nextId = () => ++seq;

export function useHeroLayers(src?: string): Layer[] {
  const [layers, setLayers] = useState<Layer[]>(() => (src ? [{ id: nextId(), src }] : []));
  useEffect(() => {
    if (!src) {
      setLayers([]);
      return;
    }
    setLayers((prev) =>
      prev[prev.length - 1]?.src === src ? prev : [...prev.slice(-1), { id: nextId(), src }],
    );
  }, [src]);
  return layers;
}
