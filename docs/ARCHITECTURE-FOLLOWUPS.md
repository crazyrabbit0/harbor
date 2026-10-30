# Architecture follow-ups

Findings from the October 2026 architecture review that `fix/architecture-review` did not fix. That branch covers the trust boundary, secrets, settings durability, the Rust/TS episode rule, dead `harbor.site` calls, Play-on pairing, the Cloudflare solver and browser windows, chrome buttons under the CSP, per-client remote replies, credentialed streaming requests, the Memory HUD's fetch wrapper, queued navigation updates and dead mpv listeners. Line numbers are from commit `273ea4bb`; check them against the current tree before editing.

Each item says what is wrong, where, why it matters, and a suggested fix. Read `AGENTS.md`, `src/AGENTS.md` and `src-tauri/AGENTS.md` first: they list the test traps (source-regex tests, mock `require` lists) that these files are covered by.

## Decided not to fix

- **Torrent engine LAN server** (`src-tauri/src/torrent_engine.rs`, `0.0.0.0:11470`, `/{hash}/create`) has no authentication. Stremio-protocol clients and the Android TV shell (gitignored `android-native/`, not in this repo) call it, so a key would break clients this repo cannot update. Revisit only together with a TV shell release that learns the web remote key.

## Bugs

1. **Writes during render.** `src/lib/settings.tsx:169` calls `setTmdbLanguage` and `:422` calls `applyProviderKeys(settings)` during render (guarded and idempotent, and documented in `src/AGENTS.md` as deliberate so children in the same pass read the new value); `src/lib/settings/load.ts:335` calls `adoptLegacyPlaylists`, which writes localStorage, from inside `parseStoredSettings`. That adoption is load-bearing: Big Picture's playlist form (`views/big-picture/bp-live-setup.tsx`) saves through `update({ iptvPlaylists })`, and the next parse of the blob is what moves the entry into `harbor.iptv.playlists.v1`. Fix: first make Big Picture add and read playlists through `lib/iptv/playlists-store.ts` (`use-bp-live.ts` and the BP settings rows also read `settings.iptvPlaylists`, which the parse deletes), then move the adoption into a one-time startup migration; replace the render-time setters only together with a `useSyncExternalStore` store their readers subscribe to.

## Native (verify, then fix)

2. **`block_on` on possibly the main thread.** `src-tauri/src/multiview.rs:909`, `torrent_engine.rs:629`, `thumbs.rs:722`, `dvr.rs:306` and `stream_proxy.rs:420` call `tauri::async_runtime::block_on` in shutdown paths. If a caller is the main or event-loop thread and the awaited task needs the main loop, the app freezes on window close. Trace each caller's thread; replace with `spawn` plus a bounded wait, or run the shutdown on a worker thread.
3. **Sync commands run on the main thread.** Tauri runs non-`async` `#[tauri::command]` functions on the main thread, so any blocking body (file I/O, process spawn, network) freezes the UI. Grep for `#[tauri::command]` followed by a non-`async fn` and move blocking ones to `async` or `spawn_blocking`.
4. **Kill by image name.** `src-tauri/src/cast_server.rs:22` runs `taskkill /F /T /FI "IMAGENAME eq stremio-server*"`, which also kills a `stremio-server` the user runs outside Harbor. Fix: record the PIDs Harbor spawns (the `proc_guard` module already reaps orphans) and kill only those.

## Network layer

5. **Direct `fetch` calls.** Up to 78 files call `fetch(` without going through `safeFetch` (some hits are local helpers named `fetch`; check each), e.g. `src/lib/mal/mutations.ts`, `src/lib/providers/omdb.ts`, `src/lib/providers/fanart.ts`, `src/lib/iptv/xtream.ts`, `src/components/add-source-modal.tsx`. They skip the tracker blocklist, the browser-build `/api-proxy` rewrite and the native `harbor_fetch` path. Fix: route them through `safeFetch` (adding hosts to `safe-fetch.ts` and `vite.config.ts` as `AGENTS.md` describes), or document why a call must stay direct.
6. **Six `safeFetch` entry points with different rules.** `safeFetchBase64`, `safeFetch`, `safeFetchLocal`, `safeFetchStream`, `safeFetchBytes` and `dedupedGet` each apply their own policy; `safeFetchLocal` turns `allowLocalNetwork` on for its callers. Fix: one internal request function with explicit options, and a short list of call sites allowed to reach the local network.
7. **Proxy host lists drift.** `PROXY_HOSTS` in `src/lib/safe-fetch.ts` and the dev proxy list in `vite.config.ts` disagree (debrid APIs, Cinemeta, OpenSubtitles, IGDB images and others), so the browser build hits CORS for them. Fix: generate one list from the other, or share a module both import.

## Structure (refactors, own branch)

8. **`src/lib/view.tsx` (1,985 lines).** A navigation provider with about 90 context fields, plus domain types (`PlayEpisode`, `PlayerSrc`, `PlayerStreamRef`) that unrelated modules import. Adding a view means editing the `View` union, the derivation chain, `frameKey` and `setView`. Fix: move the domain types to their own module, and drive the four places from one table of view definitions.
9. **`src/lib/player/mpv.ts` (1,673 lines).** `createMpvBridge` (`:270`) is one closure to the end of the file. Playback position lives in four copies: the mpv snapshot, `lib/player/playback-clock.ts`, React state and the PiP window. Fix: split the bridge into event handling, commands and snapshot modules, and make `playback-clock` the single position store the others subscribe to.
10. **The profile list has about 25 readers.** `localStorage.getItem("harbor.profiles.v1")` is parsed in about 25 modules, each with its own fallback (`settings.tsx`, `profile-store.ts`, `auth.tsx`, `cw-profile.ts`, `i18n/store.ts`, …). Fix: one reader in `lib/profiles` with a typed result, and replace the copies.
11. **Settings migrations use flags in user data.** About 20 booleans such as `_mpvEmbedV3`, `_playbackSourcePreferenceV1` and `_animeRowsV1` in the settings object record which migrations ran (`src/lib/settings/load.ts`). Fix: a numeric schema version and an ordered list of migrations.
12. **Layering.** Five `lib/` modules import from `views/`: `addons-anime-filter.ts`, `remote/host-mount.tsx`, `remote/remote-open-bridge.tsx`, `social/notifications.ts`, `social/user-search.ts`. Fix: move the shared pieces into `lib/`.
13. **Smaller items.** About 17 files use untyped `harbor:*` window events (e.g. `harbor:scroll-top`, `harbor:mpv-refresh-geom`); a typed event map would catch renames. `src/lib/debrid/realdebrid.ts` keeps `LIBRARY_CACHE` with a TTL but no size limit. `src/views/player/hdr-stage-bridge.tsx` re-sends unchanged HDR props every second; send on change only. The settings provider keeps three copies of the settings (`useState`, the store and `settingsRef`).
