import { useEffect, useState } from "react";
import { LoaderCircle, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import type { EsportsMapDef } from "@/lib/sports/esports-map-data";

const loadMapBlueprints = () => import("@/lib/sports/map-blueprints");

export function MapBlueprint({ map }: { map: EsportsMapDef }) {
  const t = useT();
  const [result, setResult] = useState<{
    key: string | undefined;
    images: { name: string; url: string }[];
    failed: boolean;
  } | null>(null);
  const [selection, setSelection] = useState<{ key: string | undefined; index: number }>({
    key: map.blueprint,
    index: 0,
  });
  const currentResult = result !== null && result.key === map.blueprint ? result : null;
  const images = currentResult ? currentResult.images : [];
  const failed = currentResult ? currentResult.failed : false;
  const selected = selection.key === map.blueprint ? selection.index : 0;
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    void loadMapBlueprints()
      .then(({ readMapBlueprints }) => readMapBlueprints(map.blueprint!, controller.signal))
      .then((items) => {
        if (controller.signal.aborted) return;
        const next = items.map((item) => {
          const url = URL.createObjectURL(
            new Blob([item.data as Uint8Array<ArrayBuffer>], {
              type: item.mime,
            }),
          );
          urls.push(url);
          return { name: item.name, url };
        });
        setResult({ key: map.blueprint, images: next, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: map.blueprint, images: [], failed: true });
      });
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [map.blueprint]);
  if (failed)
    return (
      <div className="sh-esmap-unavailable">
        <strong>{map.name}</strong>
        <p>{t("Blueprint images could not be loaded.")}</p>
        <button onClick={() => openUrl(map.source)}>
          {t("Open official map guide")}
          <ExternalLink size={15} />
        </button>
      </div>
    );
  if (!images.length)
    return (
      <div className="sh-esmap-loading" role="status">
        <LoaderCircle size={24} />
        {t("Loading map…")}
      </div>
    );
  return (
    <>
      <img
        className="sh-esmap-art"
        data-loaded="true"
        src={images[selected]?.url}
        alt={`${map.name} · ${t("Layout {n}", { n: selected + 1 })}`}
        draggable={false}
      />
      <div className="sh-esmap-blueprint-picks" role="group" aria-label={t("Explore maps")}>
        {images.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={index === selected}
            onClick={() => setSelection({ key: map.blueprint, index })}
          >
            {t("Layout {n}", { n: index + 1 })}
          </button>
        ))}
      </div>
    </>
  );
}
