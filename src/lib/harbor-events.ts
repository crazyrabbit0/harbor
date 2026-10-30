import type { HarborError } from "@/components/error-view";
import type { AccountMenuAnchor } from "@/lib/social/account-menu-open";
import type { MangaChapterIntent } from "@/lib/manga/read-intent";
import type { MusicDeepLink } from "@/lib/music/deep-link";
import type { ThemeId } from "@/lib/player-chrome";
import type { SongIdToastMsg } from "@/lib/song-id";

export type AddonsChangedDetail = {
  id?: string;
  installed?: boolean;
  enabled?: boolean;
  reordered?: boolean;
};

export type RemoteOpenDetail =
  | { action: "openMeta"; metaId: string; metaType: string; name?: string; poster?: string }
  | { action: "openService"; service: string }
  | { action: "goView"; view: string }
  | {
      action: "playMeta";
      metaId: string;
      metaType: string;
      name?: string;
      poster?: string;
      season?: number;
      episode?: number;
      resume?: boolean;
    };

// Every harbor:* window event; tests/harbor-events.test.ts fails when code dispatches or listens to an undeclared one.
export interface HarborEventMap {
  "harbor:active-profile-changed": CustomEvent<{ id: string } | null>;
  "harbor:addons-changed": CustomEvent<AddonsChangedDetail | null>;
  "harbor:anime-focus-row": CustomEvent<{ anchor: string }>;
  "harbor:community-collections-changed": Event;
  "harbor:controller-activity": Event;
  "harbor:custom-artwork": Event;
  "harbor:deeplink-install": CustomEvent<{ rawUrl: string }>;
  "harbor:deeplink-open": CustomEvent<{ open: { type: string; id: string; videoId?: string } }>;
  "harbor:deeplink-open-list": CustomEvent<{ list: { handle: string; listId: string } }>;
  "harbor:deeplink-open-music": CustomEvent<{ music: MusicDeepLink }>;
  "harbor:deeplink-profile-edit": Event;
  "harbor:ebook-library": Event;
  "harbor:ebook-metadata": Event;
  "harbor:ebook-resume": CustomEvent<string>;
  "harbor:ebook-tracking": CustomEvent<string>;
  "harbor:error": CustomEvent<HarborError>;
  "harbor:game-sidebar-changed": CustomEvent<string>;
  "harbor:immersive": CustomEvent<boolean>;
  "harbor:kids-play": Event;
  "harbor:library-badges-changed": Event;
  "harbor:library-preferences-changed": CustomEvent<string>;
  "harbor:library-shuffle-changed": CustomEvent<string>;
  "harbor:local-back": Event;
  "harbor:mpv-force-geom": Event;
  "harbor:mpv-refresh-geom": Event;
  "harbor:music-connect": Event;
  "harbor:music-explore": Event;
  "harbor:music-genre": Event;
  "harbor:music-label": Event;
  "harbor:music-library": Event;
  "harbor:music-library-changed": Event;
  "harbor:music-panel": Event;
  "harbor:music-play": Event;
  "harbor:music-playback-source-required": Event;
  "harbor:music-player-closed": Event;
  "harbor:music-playlist": Event;
  "harbor:music-playlist-cover": CustomEvent<string>;
  "harbor:music-scroll-position": Event;
  "harbor:music-search": Event;
  "harbor:music-source-consent": Event;
  "harbor:open-embed-viewport": CustomEvent<{ url: string; title?: string }>;
  "harbor:open-installer": CustomEvent<{ url: string; title?: string; logo?: string | null }>;
  "harbor:open-local-file": CustomEvent<{ path: string }>;
  "harbor:open-search": Event;
  "harbor:open-status-picker": CustomEvent<AccountMenuAnchor>;
  "harbor:open-theme-editor": Event;
  "harbor:open-theme-library": Event;
  "harbor:player-chrome-changed": CustomEvent<{ theme: ThemeId }>;
  "harbor:profiles-updated": Event;
  "harbor:read-chapter": CustomEvent<MangaChapterIntent>;
  "harbor:remote-open": CustomEvent<RemoteOpenDetail>;
  "harbor:remote-set-profile": CustomEvent<string>;
  "harbor:reset-row-scrolls": CustomEvent<{ prefix: string }>;
  "harbor:screensaver-preview": Event;
  "harbor:scroll-top": CustomEvent<{ view: string }>;
  "harbor:secrets-ready": Event;
  "harbor:song-id-toast": CustomEvent<SongIdToastMsg>;
  "harbor:spooktober-playlist": Event;
  "harbor:spotify-library-changed": Event;
  "harbor:steam-imports-changed": CustomEvent<string>;
  "harbor:steam-store-preferences": CustomEvent<string>;
  "harbor:subtitle-fps-transition-failed": Event;
  "harbor:svp-failed": Event;
  "harbor:ui-scale-activity": Event;
  "harbor:unread": CustomEvent<{ count: number }>;
  "harbor:user-activity": Event;
}

declare global {
  // Typed addEventListener for harbor:* events, so a renamed event or changed payload fails the typecheck.
  interface WindowEventMap extends HarborEventMap {}
}

/** Dispatches a harbor:* event whose name and detail are checked against HarborEventMap. */
export function emitHarborEvent<K extends keyof HarborEventMap>(
  name: K,
  ...detail: HarborEventMap[K] extends CustomEvent<infer D> ? [detail: D] : []
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    detail.length ? new CustomEvent(name, { detail: detail[0] }) : new Event(name),
  );
}
