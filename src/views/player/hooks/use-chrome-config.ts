import { useEffect, useState } from "react";
import {
  PANEL_META,
  PLAYER_CHROME_CHANGED_EVENT,
  readPlayerChromeConfig,
  type PanelCorner,
  type PlayerChromeConfig,
} from "@/lib/player-chrome";

export function useChromeConfig(chromeTheme: "stremio" | "default") {
  const [state, setState] = useState<{
    theme: "stremio" | "default";
    config: PlayerChromeConfig;
  }>(() => ({
    theme: chromeTheme,
    config: readPlayerChromeConfig(chromeTheme),
  }));
  const chromeConfig =
    state.theme === chromeTheme ? state.config : readPlayerChromeConfig(chromeTheme);
  if (state.theme !== chromeTheme) {
    setState({ theme: chromeTheme, config: chromeConfig });
  }
  useEffect(() => {
    const refresh = () =>
      setState({ theme: chromeTheme, config: readPlayerChromeConfig(chromeTheme) });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "harbor.player.chrome.profiles.v1") refresh();
    };
    window.addEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAYER_CHROME_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [chromeTheme]);

  const avatarsPanel = chromeConfig.panels?.avatars;
  const chatPanel = chromeConfig.panels?.chat;
  const episodesPanel = chromeConfig.panels?.episodes;
  const avatarsCorner: PanelCorner = avatarsPanel?.corner ?? PANEL_META.avatars.defaultCorner;
  const chatCorner: PanelCorner = chatPanel?.corner ?? PANEL_META.chat.defaultCorner;
  const episodesCorner: PanelCorner = episodesPanel?.corner ?? PANEL_META.episodes.defaultCorner;

  return {
    avatarsCorner,
    chatCorner,
    episodesCorner,
    avatarsHidden: !!avatarsPanel?.hidden,
    chatHidden: !!chatPanel?.hidden,
    episodesHidden: !!episodesPanel?.hidden,
    jumpDigitsShown: chromeConfig.controls.some((c) => c.id === "jump-digits" && !c.hidden),
  };
}
