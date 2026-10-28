# src/views/games/ (Games room UI)

Flat folder (~540 files, no subfolders): `game-*.tsx` with a `.css` twin, plus `minecraft-*`, `mod(s)-*`, `guide-*`, `pro-*`, `rom-*`, `sims-*` families and `use-*.ts` hooks. Logic lives in `src/lib/games/`, native commands in `src-tauri/src/games/` (both have AGENTS.md).

## Entry and routing

- `index.tsx` `GamesView` → `GamesViewContent`. `GamesView` mounts `GameAccessProvider` only when `useOptionalGameAccess()` finds none, so nested mounts never create a second provider.
- No router: tabs are `GameDestination` (`game-navigation.tsx`: explore, roms, library, mods, saved, downloads); sub-pages are state in `index.tsx` (`selected`, `collection`, `atlasRoute`, `recentOpen`, `modsRoute`, `libraryMode`, `emulationSystem`).
- Back is the manual `returnStack` ref in `index.tsx`, holding all of those plus scroll top and focused element. A new sub-page state must be pushed and restored there, or Back lands wrong. Restore runs in the `[active]` effect after two `requestAnimationFrame`s; don't add a second restore path.
- Leaving for another section goes through `openConnectedMedia`/`openConnectedEsports`/`openConnectedSports`, which save scroll and focus into `mediaReturn`. Calling `openMedia` directly loses the return point.
- `exploreVisit` starts a new Explore visit only when returning from another section; detail and genre Back keep the same one.

## Loading

- Global games CSS (`games.css`, `games-editorial.css`, `games-loading.css`, `game-explore-*.css`) is imported only from `index.tsx`; `game-route-loading.tsx` must load before the lazy route so the shell geometry never jumps.
- Heavy destinations use `deferredGameView(load)` (`game-deferred.tsx`); a failed chunk stays local and `retry` swaps in a fresh `lazyView`. `GameVisited` mounts on first activation and keeps the child mounted so filters and paging survive tab switches.
- `game-library-dock` and `game-dock-welcome` must stay off the main chunk (`tests/startup-bundle.test.ts`).

## Shared state (`game-access.ts` / `game-access-context.tsx`)

- Consumers import `GameAccessContext`/`useGameAccess` from `game-access.ts`; importing `GameAccessProvider` drags in the whole hook module. `useGameAccess()` throws without a provider.
- Library hooks are gated by activity: Steam/launchers on `gamesActive || dockOpen`, custom games also on `activity.custom`, emulation only on `dockOpen || activity.retro`. Call `setActivity` before reading a source that is otherwise idle, or it stays empty.
- `save()` rejects overlapping saves and drops results that land after a profile switch (`owner` ref); any new async write in the provider needs the same owner check. Overlays are keyed `${profile}:${id}`.
- `GameRetroPlayer` mounts whenever `emulation.session` matches the profile, independent of the current view; its recovery key lives in `sessionStorage`, so recovery is per window.

## Invariants from the code

- A newly opened game never briefly shows another game's connections or filters (`game-cross-media.tsx`).
- Catalog Back keeps accumulated pages and the exact failed continuation; only a new validation generation restarts at page one (`game-catalog.tsx`).
- Unknown guide availability is not "no guide"; transient failures are never cached as absence (`use-guide-availability.ts`).

## Tests

`games-rom-locales.test.ts` reads every `game-rom*`, `game-hack*` and `game-patch*` file here: each `games.hub|patch|roms|atlas.*` key must exist in all 16 locales with the same placeholders. Few tests import this folder directly; most `games-*` tests target `src/lib/games/`.
