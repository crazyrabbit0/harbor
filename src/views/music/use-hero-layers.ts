import { useState } from "react";

type Layer = { id: number; src: string };

let seq = 0;
const nextId = () => ++seq;

export function useHeroLayers(src?: string): Layer[] {
  const key = src || undefined;
  const [state, setState] = useState<{ key: string | undefined; layers: Layer[] }>(() => ({
    key,
    layers: key ? [{ id: nextId(), src: key }] : [],
  }));
  if (state.key !== key) {
    setState({
      key,
      layers: !key
        ? []
        : state.layers[state.layers.length - 1]?.src === key
          ? state.layers
          : [...state.layers.slice(-1), { id: nextId(), src: key }],
    });
  }
  return state.layers;
}
