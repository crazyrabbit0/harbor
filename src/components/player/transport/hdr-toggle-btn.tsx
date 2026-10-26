import { Contrast } from "lucide-react";
import { useSettingsSelector, useSettingsUpdate } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { StremioBtn } from "./stremio-btn";
import { BigButton } from "./big-button";
import { Tooltip } from "./tooltip";

function useHdrToSdr() {
  const settings = useSettingsSelector((s) => ({ playerHdrToSdr: s.playerHdrToSdr }));
  const update = useSettingsUpdate();
  const on = settings.playerHdrToSdr;
  return { on, toggle: () => update({ playerHdrToSdr: !on }) };
}

export function HdrToggleStremioBtn() {
  const t = useT();
  const { on, toggle } = useHdrToSdr();
  return (
    <Tooltip label={on ? t("HDR to SDR: On") : t("HDR to SDR: Off")} side="bottom">
      <StremioBtn onClick={toggle} ariaLabel={t("Toggle HDR to SDR")} active={on}>
        <Contrast size={26} strokeWidth={2} />
      </StremioBtn>
    </Tooltip>
  );
}

export function HdrToggleBigBtn() {
  const t = useT();
  const { on, toggle } = useHdrToSdr();
  return (
    <BigButton
      onClick={toggle}
      ariaLabel={t("Toggle HDR to SDR")}
      tooltip={on ? t("HDR to SDR: On") : t("HDR to SDR: Off")}
      active={on}
    >
      <Contrast size={22} />
    </BigButton>
  );
}
