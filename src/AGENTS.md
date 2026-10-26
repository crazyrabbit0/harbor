# src/ (frontend)

Notes for agents working in this folder. Root rules live in `../AGENTS.md`.

## Entrypoints

- `main.tsx` picks the app by Tauri window label or `?harbor-*=1` query: PiP, video-PiP, modal overlay, HDR overlay, DJ deck, captions, `/remote`/`/reader` (phone `MobileShell`), else `App`. Secondary Rust windows load the same bundle; adding a window means a branch here, and its app is a dynamic `import()` there, never a static import, so the main window never parses it.

## Startup bundle

- Everything `main.tsx` and `App.tsx` reach through static imports is parsed before the first screen (the main chunk is ~3.6 MB). Keep large or rarely used code behind a dynamic `import()` at its point of use. To see why a module is in the main chunk, build with `vite build --sourcemap` (needs `NODE_OPTIONS=--max-old-space-size=12288`, it runs out of memory at the default) and walk the static import chain back to `main.tsx`.
- hls.js and mpegts.js load through `lib/player/stream-libs.ts`, lottie-web through `lib/lottie.ts` (`withLottie` takes a `cancelled` check for effects that unmount first). Never `import lottie`/`import Hls` statically, and never import lucide's whole `icons` map (it pulls every icon in): use `SetIcon` or named icons. `tests/startup-bundle.test.ts` guards these.
- The awards table, flag-icons sheet (`components/flag.tsx`), music dock, Quick Library dock and nav/loader Lottie data load after first paint or on first use; optional lazy chrome sits in `SilentBoundary` so a failed chunk renders nothing instead of the crash screen. Module-level stores read localStorage/IndexedDB on first use through a lazy getter, never at import; `tests/startup-bundle.test.ts` guards both.
- `idb-cache.ts` caps only `TRIMMABLE_PREFIXES` (Cinemeta metas, TMDB catalog pages, stremio-addons) at 2000 entries; anything else in that store (music pins, Liquipedia index, rank snapshots) is never evicted, so a new refetchable cache adds its prefix there.
- Code outside `SettingsProvider` reads the `harbor.settings` mirror through `storedSettings()` (`lib/stored-settings.ts`), which parses it once per change. Per-card and per-fetch helpers must not `JSON.parse(localStorage.getItem(...))` large keys themselves; Discover spent ~80 ms per open re-parsing settings and the 0.5 MB `harbor.anidbtvdbcache`.
- `Row` (`components/row.tsx`) draws skeletons until the row comes within 600 px and keeps cards lazy per column. `alwaysActive` disables that for the whole row; use it only for rows whose children must exist (loading skeletons), not for static tile rows.
- `useView()` re-renders its caller on every navigation, and kept-alive pages (Home, Discover…) stay mounted, so every card and row under them redraws on each page change. Components that only call actions (`openMeta`, `openPicker`, `setView`, row/scroll memory) use `useViewActions()`, whose value never changes; a new action on `ViewValue` must be a stable callback and be listed in `VIEW_ACTION_KEYS`. Always-mounted chrome (top bar, sidebars, docks, search, hover preview) reads state through `useViewSelector((v) => ({ ... }))`, which re-renders only when a selected field changes; select booleans (`pickerTop: v.topKind === "picker"`) rather than `topKind`/`view` when that is all it needs. App.tsx wraps those chrome components in `memo`, so pass them only primitive props. A parked page (`[data-layer-inactive]`, `content-visibility: hidden`) reports every element as off-screen, so visibility observers (`Poster` release, `Row` near/far, `LazyChild`, the Discover `Rail`) ignore "left the viewport" there; otherwise showing the page again redraws every card and reloads its images. `Shell` itself re-renders on every navigation, so pages from `lazyView` (and `SpooktoberHome`) are `memo`'d, and `CustomizableRows`/`CatalogRows` too: a page prop or row prop built inline (`{{...}}`, `() => ...`, `[...]`, JSX) defeats that and redraws every row. `useT()` returns the same function until the language, region or catalog changes, and `useCwAdvance` returns its previous array when the list is unchanged.
- The library calendar keeps each resolved show and movie in `harbor.calendar.resolved.v1` (12 h, misses 30 min; `lib/calendar-library.ts`). Cinemeta goes first since it is one request, a run dated as closed ("2008–2013") or a movie two or more years old stops there, and TMDB (3-4 requests per show) runs only when Cinemeta has nothing.
- `main-tv.tsx` mounts `views/big-picture/bp-tv-app.tsx` (Android TV). Never import it from `main.tsx`.
- `retro-main.tsx` is the `retro-player.html` entry (game popout).

## Views and navigation

- Adding a view: add it to the `View` union (`lib/view.tsx`), add a `frameKey()` case there, then add an import fn plus a `lazyView(...)` wrapper in `App.tsx` and its render branch in `Shell`. Optionally add it to the `useViewPreloader` idle-prefetch list.
- `setView` pushes a `Frame` onto a stack and resets scroll memory. Use the existing frame kinds (`meta`, `person`, `player`, ...) for detail-like pages instead of new views.

## Tauri bridge

- There is no wrapper module; files import `@tauri-apps/api/core` `invoke`/`listen` directly, and every call needs a non-Tauri guard (`isTauri()` or `"__TAURI_INTERNALS__" in window`), since the same code runs in a browser.
- mpv state arrives only via `listen("mpv://event")` in `lib/player/mpv.ts` (`property-change`, `end-file`, `file-loaded`, `playback-restart`, synthetic `player-failure`). The UI contract is `PlayerBridge`/`PlayerSnapshot` in `lib/player/bridge.ts`.

## Player and streams

- Engine choice is `pickBridge` (`views/player/player-utils.ts`): `mpv` falls back to `html5` when `probeMpv()` fails, `auto` tries mpv first in Tauri. In the player, hls.js and mpegts.js run only inside the html5 engine (`lib/player/html5/bridge.ts`); Multiview has its own hls/mpegts/native tiles (`views/multiview/multi-player.tsx`). Controls branch on `ctx.engine`, so a new control must say what it does on html5.
- Play flow: `usePipelineResult` → `runPipeline` (`lib/streams/pipeline.ts`) → `resolveStream`/`resolveViaDebrids` (`resolve.ts`) → `usePickHandler` classifies `p2p`/`direct`/`debrid` → `openPlayer` (`views/play-picker/use-pick-handler.ts`). Autoplay walks candidates in `use-auto-fire.ts`/`use-auto-candidates.ts`.
- Player behaviour lives in `views/player/hooks/` (~90 hooks); overlays are `views/player/*-layer.tsx` composed by `player-overlay-layers.tsx`. The HUD layout editor is `views/settings/player-layout-panel/`, rendered by `components/player/transport/control-renderer*.tsx`. Big Picture has its own player (`views/big-picture/player/`).
- Every playback hotkey gives on-screen feedback. Volume and speed have their own HUD cards and subtitle delay its own readout; everything else goes through the action HUD (`components/player/action-indicator.tsx`, same glass card and slot as the speed HUD), fed by `showActionFeedback` in `views/player.tsx` and passed to `useVideoFill` and `useKeyboardShortcuts` as `onOsd`. A new hotkey passes `{ icon, title, value }`, with translated title and value naming the state it reached (`Seek` / `+10s`, `Subtitles` / `English`). Volume, speed and action cards hide each other, and any card in the top slot hides the Anime4K and SVP badges. Anime4K changes flash only while `playerAnime4kIndicator` is off, since the badge already shows the mode.
- Ctrl+=, Ctrl+- and Ctrl+0 scale the interface everywhere, the player included (`App.tsx`); don't give a player hotkey a Ctrl+digit or Ctrl+= default.
- `NextEpisodePrefetch` (`views/player/next-episode-prefetch.tsx`) runs the stream pipeline for the next aired episode once the current one shows its first frame, and stores it in the picker cache under the picker's own config hash, so Next and auto-advance find their streams ready. It skips plugins unless `pluginsBackground` is on (the entry is then stored as incomplete and the picker still asks them), and opens the top debrid link only in the last 90 s and only with `instantPlaybackPreparation` on. `keepPrefetchedPickerCache` keeps that one entry through the aggressive sweep that runs when the player unmounts.
- The in-player stream switcher always opens in place; never navigate to the full picker from it (`use-stream-switcher.ts`). A start that never plays is abandoned after `NEVER_STARTED_CEILING_MS` (45 s, `use-auto-retry.ts`).
- Opening at saved progress restarts from 0 only at `RESTART_THRESHOLD` (`use-bridge-load.ts` and `lib/player/resume-start.ts`). It must equal `WATCHED_RATIO` (0.85, `use-resume-autosave.ts`). With any lower value, an episode left between the two ratios stays in Continue Watching but restarts, and auto-skip then lands it just after the intro.

## Feature areas with their own notes

- Big Picture / Android TV: `views/big-picture/AGENTS.md`. Games: `lib/games/AGENTS.md` (+ `src-tauri/src/games/AGENTS.md`); `views/games/` is UI only. Music and DJ deck: `lib/music/AGENTS.md`.

## Detail page episode lists

- The page scroller is `scrollRef` in `views/detail.tsx`; `useScrollMemory` restores its position on entry when `resumeDetailScroll` is on, so a scroll you add must not fight a restored position.
- Episode rows carry `data-ep` (episode number) and, for anime, `data-epid`; scroll to those rather than by index. List rows use `content-visibility: auto`, so offsets shift while rows render and a one-shot scroll lands wrong; keep re-aligning until layout settles (`views/detail/use-episode-auto-scroll.ts`).
- The anime episode section is rebuilt, not just re-rendered, when `animeDetails`' `enrichPromise` resolves (`setAnimeEpisodes` in `detail.tsx`), so component state and refs inside it reset mid-visit. State that must survive that rebuild has to live outside the component.

## Anime tracker sync (MAL / AniList / Stremio / Simkl)

- `PlayEpisode` objects for tt ids reached by Next, the queue or Continue Watching are built from Cinemeta (`loadCinemetaEpisodes` in `lib/series-episodes.ts`). They carry only TVDB `season`/`episode`: no `imdbSeason`/`imdbEpisode` and no `kitsuStreamId`. Any sync gated on `imdbSeason` silently skips them, and a fallback that sends `episode` hands MAL/AniList a TVDB number (9) instead of the entry number (186). `record()` in `views/player/hooks/use-resume-autosave.ts` builds `syncEpisode` for this. The Simkl code (`lib/simkl/scrobble.ts`, `record-watched.ts`) uses the same defaulting.
- Multi-season entries (one Kitsu/MAL entry spread over several TVDB seasons, e.g. Reborn) are numbered by `absoluteEntryNumber` in `lib/anime-entry-target.ts`. AniZip episode keys drift from absolute numbering in places (Reborn around S4E23-25 and S7E14-16), so don't treat `resolveAnimeIdentity`'s `number` as the episode for these entries.
- `setEpisodesWatchedStremio` returns `null` to mean a deliberate skip, and callers treat that as success with no retry. Detected anime on a tt id is skipped unless it passes explicit `season:imdbEpisode` keys, so a missing IMDb pair means the Stremio push silently never happens.
- When debugging, the MAL/AniList "sent" map (`harbor.mal.synced.v1.<profile>`, key `harborId|season|ep`) stores the tracker's CURRENT count as `p` when the target was at or below it. A record of `…|8|9 -> 185` therefore means Harbor sent episode 9 and the call did nothing. It does not mean Harbor sent 185.

## Settings

- A new setting touches `lib/settings/types.ts` (type), `lib/settings/defaults.ts` (`DEFAULT`), and usually a sanitizer in `lib/settings/load.ts`. If user-facing, also add a `SETTINGS_OPTIONS` entry in `views/settings/nav.tsx`.
- `SETTINGS_OPTIONS` is parsed by `scripts/settings-search-entries.mjs` via the TS AST: keep it a static array of string-literal objects (no spreads, no computed values).
- Settings dialogs must portal and sit above the title bar's z-index 140; `pnpm check:settings` enforces this. Run `check:search` after changing labels or keywords.
- A new settings page needs a `SectionId` (`views/settings/shared.tsx`), a `lazy()` panel plus `SECTION_PRELOAD` entry in `views/settings.tsx`, a group in `views/settings/groups.ts` (`TOP_GROUPS`), and tabs, if any, in `tab-registry.ts` (`SECTION_TABS`).
- Row primitives come in three sets (`ui.tsx` `SRow`/`SCard`, `kit.tsx` `SettingRow`/`SettingGroup`, `shared.tsx` `ToggleRow`); match the siblings in the panel you edit. Search jumps land on `SettingGroup`'s `settingsAnchor(label)` id.
- `check:settings` also fails on overlays without Escape/backdrop/close, a `Settings` key missing from `defaults.ts`, a key written from settings UI but never read elsewhere (`src-tauri/src` counts), ALL-CAPS labels, and unreferenced or duplicate keyframes.
- Hot components (`Poster`, `PickCard`, `Row`, `ContinueCard`) and always-mounted chrome in `src/chrome/` read settings through `useSettingsSelector((s) => ({ ... }))`, selecting only the fields they use, and take `update` from `useSettingsUpdate()`; `useSettings()` re-renders its caller on every settings change. `update` returns the same state when every patched value is unchanged, so a no-op patch renders and persists nothing.
- `tmdbLanguage` and the TVDB/Trakt/MAL/IGDB keys reach their module setters at state init and then during the provider's render, guarded to run only when a value changes, so children rendering in the same pass (memo keys, "is configured" checks) already read the new value. Settings persist at once, and a burst of changes (a slider drag) writes its latest value at most every 150 ms, flushed on `pagehide`, `beforeunload` and hidden visibility.
- Persistence: localStorage `harbor.settings.<profileId>` (or `harbor.settings.shared` when linked, mirrored to `harbor.settings`), then `settings_write` to `settings.json` debounced 600 ms; tracker/server session keys go to `secrets.json` through `lib/secret-store.ts`, scoped `<prefix>.<profileId>`. `file-store.ts` swallows write errors, and `serializeSettings` drops `theme.backgroundImage` (stored separately via `saveBgImage` in `lib/theme-storage.ts`).

## Input and focus (TV / keyboard / gamepad)

- The focus engine is `lib/keyboard-navigation.ts` plus `keyboard-navigation/geometry.ts`, driven by `data-tv-*` attributes (`data-tv-nav-zone`, `data-tv-nav-cell`, `data-tv-initial-focus`, `data-tv-skip`, `data-tv-text-field`). Mark new layouts with these instead of custom key handlers.
- Activation keys are keyCodes 13/23/32 (Enter, remote Select, Space). Search-like fields take focus only and enter edit mode on activation (`isSearchLikeField`, `enterSearchEditMode`).
- The gamepad (`lib/gamepad/use-gamepad.ts`) feeds `dispatchTvNav`, so it inherits keyboard behaviour. Big Picture (`views/big-picture/`) has its own focus core (`bp-focus-core.ts`); the shell keyboard nav is disabled while it, the player or the picker is open.
- Hotkeys: defaults live in `HOTKEYS` (`lib/hotkeys.ts`) and user overrides in `settings.hotkeys`. Resolve through `effectiveBinding` / `findHotkeyMatch`, never hardcoded keys.
- Every app shortcut is a `HOTKEYS` row (Global, Player or Manga), never a raw `keydown` check on `e.key`: a hardcoded key can't be rebound and silently shares a key with the table. Only conventions stay fixed: Escape/Enter/Tab/arrows for navigation, media keys, and editor keys inside text tools (Ctrl+Z undo, Ctrl+P preview, comma in tag fields, Ctrl+W on the DJ deck window). Players outside the main view (PiP, video PiP, document PiP, trailers, music preview) reuse the player rows through `matchPlayerKey`; windows without `SettingsProvider` read overrides with `storedHotkeyOverrides`.
- `eventToBinding` keeps Shift on every key and lowercases letters, so Shift+K is `shift+k` and Caps Lock changes nothing. Number-key families are digit groups (`playerJumpDigits`, `globalRoomDigits`): the row stores only a modifier (`none`, `ctrl`, `off`), matched with `digitFromEvent`.
- Global rows stay live inside the player, so a new default must not collide with any Player or Global binding (`tests/hotkey-bindings.test.ts` checks every default pair). `effectiveBinding` drops a default whose key the user already gave to another action, so a new default never steals a key. An empty `defaultBinding` means unbound and Settings shows "Not set".

## Strings

- All UI text goes through `t()` / `useT()` from `@/lib/i18n`; see `lib/i18n/AGENTS.md`.
