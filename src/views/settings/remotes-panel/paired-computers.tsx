import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { hostTrustStore } from "@/lib/lan-trust-host";
import { platformLabel } from "@/components/play-on-lan";
import { ROW_DESC } from "../kit";
import { Section } from "../shared";
import { SButton } from "../ui";

/** Computers that paired with this Harbor through Play on and may send it titles. */
export function PairedComputersSection() {
  const t = useT();
  const store = hostTrustStore();
  const peers = useSyncExternalStore(store.subscribe, store.peers, store.peers);
  return (
    <Section
      title={t("Paired computers")}
      subtitle={t("These computers paired with this Harbor and can send it titles with Play on.")}
    >
      {peers.length === 0 ? (
        <p className={`max-w-[70ch] ${ROW_DESC}`}>
          {t("No computer has paired with this Harbor yet.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {peers.map((peer) => (
            <li
              key={peer.peerId}
              className="flex items-center gap-3 rounded-[10px] bg-elevated px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-medium text-ink">
                  {peer.name || t("Another computer")}
                </p>
                <p className="truncate text-[13px] text-ink-subtle">
                  {[platformLabel(peer.platform), peer.version ? `Harbor ${peer.version}` : ""]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </div>
              <SButton variant="danger" onClick={() => store.forget(peer.peerId)}>
                {t("Forget")}
              </SButton>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
