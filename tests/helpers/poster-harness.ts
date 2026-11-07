import * as posterSizing from "../../src/lib/poster-sizing";
import { hookHarness } from "./hook-harness.ts";

export type PosterNode = { type: unknown; props: Record<string, any> };

/** Loads components/poster.tsx; `box` is what getBoundingClientRect reports for the poster root. */
export function posterHarness(
  exportName: "Poster" | "useLocalizedPoster",
  {
    box = { width: 100, height: 300 },
    settings = {},
    localize = true,
    imdbToTmdb = async (_key: string, _id: string): Promise<string | null> => null,
  }: {
    box?: { width: number; height: number };
    settings?: Record<string, unknown>;
    localize?: boolean;
    imdbToTmdb?: (key: string, id: string) => Promise<string | null>;
  } = {},
) {
  const calls = { imdbToTmdb: [] as string[][], localized: [] as string[][] };
  // The root div gets a fake element during render, as React attaches refs before effects run.
  const element = { getBoundingClientRect: () => box, clientWidth: box.width / 2 };
  const jsx = (type: unknown, props: Record<string, any>): PosterNode => {
    if (type === "div" && props.ref && typeof props.ref === "object") props.ref.current = element;
    return { type, props };
  };
  const all = { posterQuality: "high", posterEffect: "fade", tmdbKey: "key", ...settings };
  const h = hookHarness(
    "src/components/poster.tsx",
    exportName,
    {
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "@/lib/providers/rpdb": {
        needsImdbForPoster: () => false,
        needsTmdbForPoster: () => false,
        rpdbPoster: (_key: string, _id: string, base?: string) => base,
      },
      "@/lib/title-poster": { useTitlePoster: () => undefined },
      "@/lib/providers/tmdb/tmdb-imdb-resolve": {
        tmdbIdFromImdb: (key: string, id: string) => {
          calls.imdbToTmdb.push([key, id]);
          return imdbToTmdb(key, id);
        },
        tmdbImdbId: async () => null,
        useTmdbIdFromImdb: () => undefined,
        useTmdbImdbId: () => undefined,
      },
      "@/lib/settings": { useSettingsSelector: (pick: (s: unknown) => unknown) => pick(all) },
      "@/lib/providers/anime-mapping": {
        externalToKitsu: async () => null,
        kitsuToImdb: async () => null,
        kitsuToTvdb: async () => null,
      },
      "@/lib/providers/tmdb/tmdb-images": {
        tmdbLocalizedPoster: async (key: string, id: string) => {
          calls.localized.push([key, id]);
          return `localized:${id}`;
        },
      },
      "@/lib/img-size": {
        sizeImageUrl: (url: string, width: number) => `${url}?w=${width}`,
        qualityMultiplier: () => 1,
      },
      "@/lib/providers/tmdb/tmdb-image-lang": { shouldLocalizePosters: () => localize },
      "@/lib/remote-image-proxy": { useProxiedImageSrc: (url?: string) => url },
      "@/lib/visibility": {
        observeWithin: () => () => {},
        observeResize: (_el: unknown, onResize: () => void) => {
          onResize();
          return () => {};
        },
      },
      "@/lib/poster-sizing": posterSizing,
    },
    {
      window: {
        devicePixelRatio: 1,
        innerHeight: 800,
        addEventListener() {},
        removeEventListener() {},
        setTimeout: () => 0,
        clearTimeout() {},
      },
    },
  );
  return { render: (args: unknown) => h.render(args), calls };
}

const nodes = (n: unknown): PosterNode[] =>
  Array.isArray(n)
    ? n.flatMap(nodes)
    : n && typeof n === "object"
      ? [n as PosterNode, ...nodes((n as PosterNode).props?.children)]
      : [];

/** The src of the image the poster is loading, once it knows its target width. */
export const loadingSrc = (tree: unknown): string | undefined =>
  nodes(tree).find((n) => n.type === "img")?.props.src;
