import {
  DEFAULT_THEME,
  FONT_PAIRS,
  isKnownPreset,
  type CustomColors,
  type ThemeSettings,
} from "@/lib/theme";
import { languageName } from "@/lib/subtitles/language";
import { sanitizeClipLength, sanitizeSeekStep } from "@/lib/seek-step";
import { migrateModelId, providerTabFor } from "@/lib/ai-models";
import {
  sanitizeFullscreenClockFormat,
  sanitizeFullscreenClockSize,
  sanitizeFullscreenClockStyle,
} from "@/lib/local-time";
import { normalizePosterCardSettings } from "@/lib/poster-backdrop-expansion";
import {
  sanitizeSubtitleOffsetPosition,
  sanitizeSubtitleOffsetSize,
} from "@/lib/player/subtitle-offset";
import { sanitizeBufferSize } from "@/lib/player/buffer-profile";
import { sanitizeScreensaverMedia } from "@/lib/screensaver/media";
import {
  sanitizeControllerCursor,
  sanitizeControllerCursorHideMs,
  sanitizeControllerCursorImage,
  sanitizeControllerCursorSize,
} from "@/lib/gamepad/cursor";

const RETIRED_GEMINI = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-3-pro-preview",
]);
import { DEFAULT, STORAGE_KEY } from "./defaults";
import type { Settings } from "./types";
import { adoptLegacyPlaylists } from "@/lib/iptv/playlists-store";
import { runSettingsMigrations, type StoredSettings } from "./migrations";
import { sanitizeDisplaySelection } from "@/lib/monitors";

const HEX_RE = /^#[0-9a-f]{6}$/i;

function sanitizePosterDockTransition(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT.posterDockTransitionMs;
  }
  return Math.min(1500, Math.max(250, Math.round(value)));
}

function sanitizeTopbarAppearance(
  value: unknown,
  transparent: unknown,
  glassControls: unknown,
): Settings["topbarAppearance"] {
  if (value === "transparent" || value === "glass" || value === "filled") return value;
  if (glassControls === true) return "glass";
  return transparent === false ? "filled" : "transparent";
}

function legacySeekStep(direction: "back" | "forward"): number | undefined {
  try {
    const raw = localStorage.getItem(`harbor.seek-step.${direction}`);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeCustomColors(c: unknown): CustomColors | null {
  if (!c || typeof c !== "object") return null;
  const obj = c as Partial<CustomColors>;
  const keys: Array<keyof CustomColors> = [
    "canvas",
    "surface",
    "elevated",
    "raised",
    "ink",
    "inkMuted",
    "inkSubtle",
    "edge",
    "accent",
    "danger",
  ];
  const out = {} as CustomColors;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v !== "string" || !HEX_RE.test(v)) return null;
    out[k] = v;
  }
  return out;
}

export function sanitizeTheme(t: Partial<ThemeSettings> | undefined): ThemeSettings {
  if (!t) return DEFAULT_THEME;
  const isBuiltIn =
    typeof t.preset === "string" && t.preset !== "custom" && isKnownPreset(t.preset);
  const isUserPreset = typeof t.preset === "string" && t.preset.startsWith("user:");
  const isPreset = isBuiltIn || isUserPreset;
  const isCustom = t.preset === "custom";
  const fontOk = typeof t.fontPair === "string" && t.fontPair in FONT_PAIRS;
  const dimOk = typeof t.backgroundDim === "number" && t.backgroundDim >= 0 && t.backgroundDim <= 1;
  const imgOk =
    t.backgroundImage == null ||
    (typeof t.backgroundImage === "string" && t.backgroundImage.length < 3_000_000);
  const customColors = sanitizeCustomColors(t.customColors);
  const preset: ThemeSettings["preset"] = isPreset
    ? (t.preset as ThemeSettings["preset"])
    : isCustom && customColors
      ? "custom"
      : DEFAULT_THEME.preset;
  return {
    preset,
    fontPair: fontOk ? (t.fontPair as ThemeSettings["fontPair"]) : DEFAULT_THEME.fontPair,
    backgroundDim: dimOk ? (t.backgroundDim as number) : DEFAULT_THEME.backgroundDim,
    backgroundImage: imgOk ? (t.backgroundImage ?? null) : null,
    customColors,
    customFontId: typeof t.customFontId === "string" ? t.customFontId : null,
  };
}

let cachedKey: string | null = null;
let cachedRaw: string | null = null;
let cachedSettings: Settings | null = null;

export function loadStoredSettings(rawKey: string = STORAGE_KEY): Settings {
  const raw = localStorage.getItem(rawKey);
  if (cachedSettings && cachedKey === rawKey && cachedRaw === raw) return cachedSettings;
  const settings = parseStoredSettings(raw);
  cachedKey = rawKey;
  cachedRaw = raw;
  cachedSettings = settings;
  return settings;
}

function parseStoredSettings(raw: string | null): Settings {
  if (!raw) {
    return {
      ...DEFAULT,
      seekBackStepSec: sanitizeSeekStep(legacySeekStep("back"), DEFAULT.seekBackStepSec),
      seekForwardStepSec: sanitizeSeekStep(legacySeekStep("forward"), DEFAULT.seekForwardStepSec),
    };
  }
  try {
    const parsed = JSON.parse(raw) as StoredSettings & {
      topbarGlassControls?: boolean;
      scrapers?: unknown;
      scrapersAcknowledged?: boolean;
      _scrapersV2?: boolean;
    };
    runSettingsMigrations(parsed);
    parsed.contentAdvisoryToast = parsed.contentAdvisoryToast === true;
    if (parsed.contentAdvisoryTheme !== "monochrome" && parsed.contentAdvisoryTheme !== "colored") {
      parsed.contentAdvisoryTheme = DEFAULT.contentAdvisoryTheme;
    }
    if (typeof parsed.contentAdvisoryShowIgnore !== "boolean") {
      parsed.contentAdvisoryShowIgnore = true;
    }
    if (
      typeof parsed.songIdAiModel === "string" &&
      RETIRED_GEMINI.has(parsed.songIdAiModel.trim())
    ) {
      parsed.songIdAiModel = DEFAULT.songIdAiModel;
    }
    if (parsed.aiSearchModel) parsed.aiSearchModel = migrateModelId(parsed.aiSearchModel);
    if (typeof parsed.steamSearchShortcut !== "boolean")
      parsed.steamSearchShortcut = DEFAULT.steamSearchShortcut;
    if (!["first", "random", "manual"].includes(parsed.gameArtworkSelection as string))
      parsed.gameArtworkSelection = DEFAULT.gameArtworkSelection;
    if (typeof parsed.gameArtworkScreenshots !== "boolean")
      parsed.gameArtworkScreenshots = DEFAULT.gameArtworkScreenshots;
    if (typeof parsed.gameArtworkCoverIcon !== "boolean")
      parsed.gameArtworkCoverIcon = DEFAULT.gameArtworkCoverIcon;
    if (parsed.gameAgeRatingAgency !== "ESRB" && parsed.gameAgeRatingAgency !== "PEGI")
      parsed.gameAgeRatingAgency = DEFAULT.gameAgeRatingAgency;
    if (parsed.aiSearchProvider !== "groq" && parsed.aiSearchProvider !== "openrouter") {
      parsed.aiSearchProvider = parsed.aiSearchModel
        ? providerTabFor(parsed.aiSearchModel)
        : "openrouter";
    }
    parsed.mpvBufferSize = sanitizeBufferSize(parsed.mpvBufferSize);
    delete parsed.scrapers;
    delete parsed.scrapersAcknowledged;
    delete parsed._scrapersV2;
    // Playlists now live in their own store; adopt any stranded legacy field and
    // only drop it once it has been persisted, so a failed write never loses data.
    if ("iptvPlaylists" in parsed) {
      if (adoptLegacyPlaylists(Array.isArray(parsed.iptvPlaylists) ? parsed.iptvPlaylists : [])) {
        delete parsed.iptvPlaylists;
      }
    }
    if (parsed.cwSources == null) {
      const ext = parsed.externalContinueWatching === true;
      parsed.cwSources = { library: true, trakt: ext, simkl: ext, local: true };
    }
    const posterCards = normalizePosterCardSettings(parsed);
    return {
      ...DEFAULT,
      ...parsed,
      ...posterCards,
      showQuickGameLibrary: parsed.showQuickGameLibrary === true,
      topbarAppearance: sanitizeTopbarAppearance(
        parsed.topbarAppearance,
        parsed.transparentTopBar,
        parsed.topbarGlassControls,
      ),
      posterDockTransitionMs: sanitizePosterDockTransition(parsed.posterDockTransitionMs),
      bigPictureDisplay: sanitizeDisplaySelection(parsed.bigPictureDisplay),
      playerSeparateDisplay: sanitizeDisplaySelection(parsed.playerSeparateDisplay),
      playerSeparateCoverTaskbar:
        typeof parsed.playerSeparateCoverTaskbar === "boolean"
          ? parsed.playerSeparateCoverTaskbar
          : DEFAULT.playerSeparateCoverTaskbar,
      fullscreenClockEnabled:
        typeof parsed.fullscreenClockEnabled === "boolean"
          ? parsed.fullscreenClockEnabled
          : DEFAULT.fullscreenClockEnabled,
      controllerCursor: sanitizeControllerCursor(parsed.controllerCursor),
      screensaverStyle:
        parsed.screensaverStyle === "catBoat" ||
        parsed.screensaverStyle === "halloween" ||
        parsed.screensaverStyle === "custom"
          ? parsed.screensaverStyle
          : "ambient",
      screensaverMedia: sanitizeScreensaverMedia(parsed.screensaverMedia),
      screensaverMediaId:
        typeof parsed.screensaverMediaId === "string" ? parsed.screensaverMediaId : null,
      controllerCursorImage: sanitizeControllerCursorImage(parsed.controllerCursorImage),
      controllerCursorSize: sanitizeControllerCursorSize(parsed.controllerCursorSize),
      controllerCursorEnabled:
        typeof parsed.controllerCursorEnabled === "boolean"
          ? parsed.controllerCursorEnabled
          : DEFAULT.controllerCursorEnabled,
      controllerCursorHideMs: sanitizeControllerCursorHideMs(parsed.controllerCursorHideMs),
      fullscreenClockFormat: sanitizeFullscreenClockFormat(parsed.fullscreenClockFormat),
      fullscreenClockStyle: sanitizeFullscreenClockStyle(parsed.fullscreenClockStyle),
      fullscreenClockShowSeconds:
        typeof parsed.fullscreenClockShowSeconds === "boolean"
          ? parsed.fullscreenClockShowSeconds
          : DEFAULT.fullscreenClockShowSeconds,
      fullscreenClockShowEndTime:
        typeof parsed.fullscreenClockShowEndTime === "boolean"
          ? parsed.fullscreenClockShowEndTime
          : DEFAULT.fullscreenClockShowEndTime,
      fullscreenClockSizePx: sanitizeFullscreenClockSize(parsed.fullscreenClockSizePx),
      streaming: { ...DEFAULT.streaming, ...parsed.streaming },
      subOffsetIndicatorEnabled:
        typeof parsed.subOffsetIndicatorEnabled === "boolean"
          ? parsed.subOffsetIndicatorEnabled
          : DEFAULT.subOffsetIndicatorEnabled,
      subOffsetIndicatorPosition: sanitizeSubtitleOffsetPosition(parsed.subOffsetIndicatorPosition),
      subOffsetIndicatorSize: sanitizeSubtitleOffsetSize(parsed.subOffsetIndicatorSize),
      subProvidersEnabled: {
        ...DEFAULT.subProvidersEnabled,
        ...parsed.subProvidersEnabled,
      },
      hideContent: {
        ...DEFAULT.hideContent,
        ...parsed.hideContent,
      },
      homeRows: {
        ...DEFAULT.homeRows,
        ...parsed.homeRows,
      },
      navCustomization: {
        ...DEFAULT.navCustomization,
        ...parsed.navCustomization,
      },
      animeRows: {
        ...DEFAULT.animeRows,
        ...parsed.animeRows,
      },
      letterboxd: {
        ...DEFAULT.letterboxd,
        ...parsed.letterboxd,
      },
      preferredSubLangs: (Array.isArray(parsed.preferredSubLangs)
        ? parsed.preferredSubLangs.filter((l): l is string => typeof l === "string")
        : DEFAULT.preferredSubLangs
      ).map(languageName),
      preferredAudioLangs: (Array.isArray(parsed.preferredAudioLangs)
        ? parsed.preferredAudioLangs.filter((l): l is string => typeof l === "string")
        : DEFAULT.preferredAudioLangs
      ).map(languageName),
      castAlwaysTranscode: parsed.castAlwaysTranscode ?? DEFAULT.castAlwaysTranscode,
      showMalBadge: parsed.showMalBadge ?? DEFAULT.showMalBadge,
      badgePlacement:
        parsed.badgePlacement === "top" || parsed.badgePlacement === "bottom"
          ? parsed.badgePlacement
          : DEFAULT.badgePlacement,
      harborColor:
        typeof parsed.harborColor === "string" && HEX_RE.test(parsed.harborColor)
          ? parsed.harborColor
          : DEFAULT.harborColor,
      traktClientId:
        typeof parsed.traktClientId === "string" ? parsed.traktClientId : DEFAULT.traktClientId,
      traktClientSecret:
        typeof parsed.traktClientSecret === "string"
          ? parsed.traktClientSecret
          : DEFAULT.traktClientSecret,
      malClientId:
        typeof parsed.malClientId === "string" ? parsed.malClientId : DEFAULT.malClientId,
      traktAccessToken: parsed.traktAccessToken ?? DEFAULT.traktAccessToken,
      traktRefreshToken: parsed.traktRefreshToken ?? DEFAULT.traktRefreshToken,
      traktExpiresAt: parsed.traktExpiresAt ?? DEFAULT.traktExpiresAt,
      traktUsername: parsed.traktUsername ?? DEFAULT.traktUsername,
      seekBackStepSec: sanitizeSeekStep(
        parsed.seekBackStepSec ?? legacySeekStep("back"),
        DEFAULT.seekBackStepSec,
      ),
      seekForwardStepSec: sanitizeSeekStep(
        parsed.seekForwardStepSec ?? legacySeekStep("forward"),
        DEFAULT.seekForwardStepSec,
      ),
      seekBackStepShortSec: sanitizeSeekStep(
        parsed.seekBackStepShortSec,
        DEFAULT.seekBackStepShortSec,
      ),
      seekForwardStepShortSec: sanitizeSeekStep(
        parsed.seekForwardStepShortSec,
        DEFAULT.seekForwardStepShortSec,
      ),
      seekBackStepLongSec: sanitizeSeekStep(
        parsed.seekBackStepLongSec,
        DEFAULT.seekBackStepLongSec,
      ),
      seekForwardStepLongSec: sanitizeSeekStep(
        parsed.seekForwardStepLongSec,
        DEFAULT.seekForwardStepLongSec,
      ),
      clipLengthSec: sanitizeClipLength(parsed.clipLengthSec, DEFAULT.clipLengthSec),
      screenshotDir: typeof parsed.screenshotDir === "string" ? parsed.screenshotDir : "",
      gifDir: typeof parsed.gifDir === "string" ? parsed.gifDir : "",
      clipDir: typeof parsed.clipDir === "string" ? parsed.clipDir : "",
      theme: sanitizeTheme(parsed.theme),
      webhooks: {
        ...DEFAULT.webhooks,
        ...parsed.webhooks,
        sources: {
          ...DEFAULT.webhooks.sources,
          ...parsed.webhooks?.sources,
        },
      },
      customCalendar: {
        ...DEFAULT.customCalendar,
        ...parsed.customCalendar,
        trackedPeople: Array.isArray(parsed.customCalendar?.trackedPeople)
          ? parsed.customCalendar.trackedPeople
          : [],
        genres: Array.isArray(parsed.customCalendar?.genres) ? parsed.customCalendar.genres : [],
        watchProviders: Array.isArray(parsed.customCalendar?.watchProviders)
          ? parsed.customCalendar.watchProviders
          : [],
        originCountries: Array.isArray(parsed.customCalendar?.originCountries)
          ? parsed.customCalendar.originCountries
          : [],
        mediaTypes: {
          movie: parsed.customCalendar?.mediaTypes?.movie !== false,
          tv: parsed.customCalendar?.mediaTypes?.tv !== false,
          anime: parsed.customCalendar?.mediaTypes?.anime !== false,
        },
      },
      webhookRules: Array.isArray(parsed.webhookRules)
        ? parsed.webhookRules
            .filter((r) => r != null && typeof r === "object")
            .map((r) => ({
              ...r,
              channels: {
                discord: r.channels?.discord ?? false,
                telegram: r.channels?.telegram ?? false,
                desktop: r.channels?.desktop ?? false,
              },
            }))
        : [],
      customStreamFilters: Array.isArray(parsed.customStreamFilters)
        ? parsed.customStreamFilters
        : DEFAULT.customStreamFilters,
      streamPriority: Array.isArray(parsed.streamPriority)
        ? parsed.streamPriority
        : DEFAULT.streamPriority,
      animeFavoriteGenres: Array.isArray(parsed.animeFavoriteGenres)
        ? parsed.animeFavoriteGenres.filter((g): g is number => typeof g === "number")
        : DEFAULT.animeFavoriteGenres,
      animePicksDismissedAt:
        typeof parsed.animePicksDismissedAt === "number"
          ? parsed.animePicksDismissedAt
          : DEFAULT.animePicksDismissedAt,
      localReviewDismissedCount:
        typeof parsed.localReviewDismissedCount === "number"
          ? parsed.localReviewDismissedCount
          : DEFAULT.localReviewDismissedCount,
      animeAnilistRowsHidden: Array.isArray(parsed.animeAnilistRowsHidden)
        ? parsed.animeAnilistRowsHidden.filter((k): k is string => typeof k === "string")
        : DEFAULT.animeAnilistRowsHidden,
      tmdbImageLangs: Array.isArray(parsed.tmdbImageLangs)
        ? parsed.tmdbImageLangs.filter((l): l is string => typeof l === "string")
        : DEFAULT.tmdbImageLangs,
    };
  } catch {
    return DEFAULT;
  }
}
