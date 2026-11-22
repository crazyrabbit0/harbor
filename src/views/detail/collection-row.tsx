import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { tmdbCollection } from "@/lib/providers/tmdb";
import { useActiveKid } from "@/lib/profiles";
import { useSettingsSelector } from "@/lib/settings";
import { useViewActions } from "@/lib/view";
import { dropUnreleased, dropUnsafeGenres } from "@/views/kids/kids-filter";

export function CollectionRow({
  collection,
  currentId,
}: {
  collection: { id: number; name: string };
  currentId: string;
}) {
  const settings = useSettingsSelector((s) => ({ tmdbKey: s.tmdbKey }));
  const { openCollection } = useViewActions();
  const kid = useActiveKid();
  const fetchKey = settings.tmdbKey
    ? `${settings.tmdbKey}:${collection.id}:${currentId}:${kid ? 1 : 0}`
    : "";
  const [loaded, setLoaded] = useState<{ key: string; parts: Meta[] } | null>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    tmdbCollection(settings.tmdbKey, collection.id)
      .then((c) => {
        if (cancelled) return;
        const rest = c ? c.parts.filter((p) => p.id !== currentId) : [];
        setLoaded({
          key: fetchKey,
          parts: kid ? dropUnsafeGenres(dropUnreleased(rest)) : rest,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchKey, settings.tmdbKey, collection.id, currentId, kid]);

  const parts = fetchKey && loaded?.key === fetchKey ? loaded.parts : [];

  if (parts.length === 0) return null;

  return (
    <Row
      scrollKey={`collection-${collection.id}`}
      title={
        <button
          onClick={() => openCollection(collection.id)}
          className="group inline-flex items-center gap-1.5 text-start transition-colors hover:text-ink"
        >
          {collection.name}
          <ChevronRight
            size={18}
            strokeWidth={2.4}
            className="dir-icon text-ink-subtle transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
          />
        </button>
      }
    >
      {parts.map((m) => (
        <PickCard key={m.id} meta={m} kids={!!kid} />
      ))}
    </Row>
  );
}
