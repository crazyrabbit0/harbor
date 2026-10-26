import { CollectionCard } from "@/components/collection-card";
import { COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import { useT } from "@/lib/i18n";
import { useSettingsSelector } from "@/lib/settings";
import { useViewActions } from "@/lib/view";
import { Row } from "./row";

export function CollectionsRow({ title }: { title?: string }) {
  const settings = useSettingsSelector((s) => ({ tmdbKey: s.tmdbKey }));
  const { openCollections } = useViewActions();
  const t = useT();
  if (!settings.tmdbKey) return null;
  return (
    <Row
      title={title ?? t("Collections")}
      min={250}
      shape="landscape"
      scrollKey="home:collections"
      onViewAll={openCollections}
    >
      {COLLECTIONS_CATALOG.slice(0, 30).map((c) => (
        <CollectionCard key={`${c.id}-${c.name}`} id={c.id} name={c.name} />
      ))}
    </Row>
  );
}
