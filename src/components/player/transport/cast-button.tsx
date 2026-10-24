import { Cast } from "lucide-react";
import type { PlayerCapabilities } from "@/lib/player/bridge";
import { useT } from "@/lib/i18n";
import { BigButton } from "./big-button";
import { withHotkey } from "./hotkey-label";

export function CastButton({
  onClick,
  capabilities,
}: {
  onClick: () => void;
  capabilities: PlayerCapabilities;
}) {
  const t = useT();
  const supported = capabilities.airplay || capabilities.chromecast;
  return (
    <BigButton
      onClick={onClick}
      ariaLabel={t("Cast")}
      tooltip={
        supported
          ? withHotkey(t("Cast to a device"), "playerCast")
          : t("Casting comes with the mpv backend")
      }
      disabled={!supported}
    >
      <Cast size={22} strokeWidth={1.9} />
    </BigButton>
  );
}
