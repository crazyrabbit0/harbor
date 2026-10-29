/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __IS_BETA_BUILD__: boolean;
declare const __BUILD_ID__: string;
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_HARBOR_API_BASE?: string;
  readonly VITE_HARBOR_DATA_BASE?: string;
  readonly VITE_HARBOR_BUGS_BASE?: string;
  readonly VITE_TRAKT_CLIENT_ID?: string;
  readonly VITE_TRAKT_CLIENT_SECRET?: string;
  readonly VITE_MAL_CLIENT_ID?: string;
  readonly VITE_ANILIST_CLIENT_ID?: string;
}

interface Window {
  __harborStremioDeeplink?: boolean;
  __harborInstallerOpen?: boolean;
}
