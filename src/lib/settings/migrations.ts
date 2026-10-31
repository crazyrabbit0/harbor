import { readPlaylists } from "@/lib/iptv/playlists-store";
import { DEFAULT } from "./defaults";
import type { Settings } from "./types";

// A stored settings blob before sanitizing: any field may be missing, plus the legacy migration flags.
export type StoredSettings = Partial<Settings> & Record<string, unknown>;

type Migration = {
  // Flag that older builds wrote when this ran; kept in the blob so rolling back never re-runs it.
  flag: string;
  run(s: StoredSettings): void;
};

// Append only: the index of each entry is part of the stored version, so never reorder or remove one.
export const SETTINGS_MIGRATIONS: readonly Migration[] = [
  {
    flag: "_playbackSourcePreferenceV1",
    run(s) {
      s.playbackSourcePreference = s.localPlaybackMode === "local" ? "local" : "online";
      s.preferredMediaServerId = null;
    },
  },
  {
    flag: "_playbackSourcePreferenceV2",
    run(s) {
      if (s.playbackSourcePreference === "ask") s.playbackSourcePreference = "online";
    },
  },
  {
    flag: "_animeRowsV1",
    run(s) {
      const prev = (s.animeRows ?? {}) as Partial<Settings["animeRows"]>;
      const hidden = new Set<string>(Array.isArray(prev.hidden) ? prev.hidden : []);
      const anilist = Array.isArray(s.animeAnilistRowsHidden) ? s.animeAnilistRowsHidden : [];
      const mal = Array.isArray(s.animeMalRowsHidden) ? s.animeMalRowsHidden : [];
      if (anilist.includes("yourLists")) hidden.add("yourAnilistLists");
      if (anilist.includes("trending")) hidden.add("anilistTrending");
      if (anilist.includes("top100")) hidden.add("anilistTop100");
      if (mal.includes("yourMalLists")) hidden.add("yourMalLists");
      s.animeRows = {
        order: Array.isArray(prev.order) ? prev.order : [],
        hidden: [...hidden],
        renamed: prev.renamed && typeof prev.renamed === "object" ? prev.renamed : {},
      };
    },
  },
  {
    flag: "_pickerLayoutStremioV2",
    run(s) {
      if (s.pickerLayout === "condensed") s.pickerLayout = "stremio";
      s._pickerLayoutStremio = true;
    },
  },
  {
    flag: "_stremioDeeplinkOnByDefault",
    run(s) {
      s.stremioDeeplinkInstall = true;
    },
  },
  {
    flag: "_skipButtonHideSecV2",
    run(s) {
      const sec = s.skipButtonHideSec;
      if (sec === 10 || sec === 20 || sec == null) s.skipButtonHideSec = 14;
    },
  },
  {
    flag: "_anilistSyncOnV1",
    run(s) {
      s.anilistAutoSync = true;
    },
  },
  {
    flag: "_musicSeekThumbV1",
    run(s) {
      s.musicSeekThumb = true;
      s.musicSeekThumbHover = true;
    },
  },
  {
    flag: "_rememberLastStreamOnV1",
    run(s) {
      s.rememberLastStream = true;
    },
  },
  {
    flag: "_streamSortAddonV1",
    run(s) {
      if (s.streamSort === "harbor") s.streamSort = "addon";
    },
  },
  {
    flag: "_tennisWtaV1",
    run(s) {
      const leagues = s.sportsLeagues;
      if (Array.isArray(leagues) && leagues.includes("TENNIS") && !leagues.includes("TENNIS_WTA"))
        leagues.push("TENNIS_WTA");
    },
  },
  {
    flag: "_mpvEmbedV3",
    run(s) {
      s.playerMpvEmbed = true;
    },
  },
  {
    flag: "_mpvEmbedV4",
    run(s) {
      s.playerMpvEmbed = true;
    },
  },
  {
    flag: "_mpvBufferSizeV1",
    run(s) {
      if (s.mpvBufferBoost) s.mpvBufferSize = "large";
    },
  },
  {
    flag: "_anime4kIndicatorOffV1",
    run(s) {
      s.playerAnime4kIndicator = false;
    },
  },
  {
    flag: "_subStyleV2",
    run(s) {
      if (s.subFontSize === 55) s.subFontSize = DEFAULT.subFontSize;
      if (s.subBorderSize === 3) s.subBorderSize = DEFAULT.subBorderSize;
      if (s.subMarginY === 22) s.subMarginY = DEFAULT.subMarginY;
    },
  },
  {
    flag: "_liquidGlassOptIn",
    run(s) {
      s.liquidGlass = false;
      s.experimentalLiquidGlassEnabled = false;
    },
  },
  {
    flag: "_smoothScrollOptIn",
    run(s) {
      s.smoothScroll = false;
    },
  },
  {
    flag: "_streamCacheCapV1",
    run(s) {
      if (s.streamCacheMaxGb === 0 || s.streamCacheMaxGb == null)
        s.streamCacheMaxGb = DEFAULT.streamCacheMaxGb;
      if (s.streamCacheRetentionHours === 24 || s.streamCacheRetentionHours == null)
        s.streamCacheRetentionHours = DEFAULT.streamCacheRetentionHours;
    },
  },
  {
    flag: "_playlistsTabV1",
    run(s) {
      if (readPlaylists().some((l) => l?.kind !== "epg")) s.showPlaylistsTab = true;
    },
  },
  { flag: "_navThemeRepairV1", run() {} },
  {
    flag: "_navHideMigrateV1",
    run(s) {
      const legacy = (s.hideContent ?? {}) as Record<string, unknown>;
      const carry: string[] = [];
      if (legacy.manga === true) carry.push("manga");
      if (legacy.liveTv === true) carry.push("live");
      if (carry.length > 0) {
        const prevNav = (s.navCustomization ?? {}) as { hidden?: unknown };
        const prev = Array.isArray(prevNav.hidden)
          ? prevNav.hidden.filter((x): x is string => typeof x === "string")
          : [];
        s.navCustomization = {
          ...s.navCustomization,
          hidden: [...prev, ...carry.filter((c) => !prev.includes(c))],
        } as Settings["navCustomization"];
      }
      delete legacy.manga;
      delete legacy.liveTv;
    },
  },
];

export const SETTINGS_SCHEMA_VERSION = SETTINGS_MIGRATIONS.length;

/** Runs the migrations this blob has not seen yet, in order, and records the version reached. */
export function runSettingsMigrations(s: StoredSettings): void {
  const stored = typeof s._schemaVersion === "number" ? s._schemaVersion : null;
  SETTINGS_MIGRATIONS.forEach((migration, index) => {
    // A blob from before the version existed records each migration by its own flag.
    const done = stored != null ? index < stored : s[migration.flag] === true;
    if (!done) migration.run(s);
    s[migration.flag] = true;
  });
  s._schemaVersion = SETTINGS_SCHEMA_VERSION;
}
