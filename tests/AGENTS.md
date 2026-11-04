# tests/ (Node test suite)

Loader, single-file command and the source-regex trap are in the root `AGENTS.md`. This file covers the folder's own conventions.

## Layout

- Flat `tests/<topic>.test.ts` (~790) and `.test.mjs` (~30, plain JS). Families share a prefix: `games-*`, `music-*`, `sports-*`, `manga-*`, `player-*`, `plugin-*`, `stream-plugins-*`, `cw-*`, `p2p-*`, `addon-*`, `tracker-*`, `skip-*`, `anime-*`, `bp-*`, `tv-panel-*`, `settings-*`. Name a new file after the family it joins.
- `tests/_*.ts` are shared stubs (`_localstorage-stub.ts`, `_indexeddb-stub.ts`, `_tv-panel-kotlin.ts`, `_tv-panel-kt-lex.ts`); the leading `_` keeps them out of the glob. `tests/music/` (2 files) and `tests/fixtures/` are subfolders the glob skips, so a `.test.ts` placed there never runs under `pnpm test`.
- `tests/helpers/` holds harness factories named `<topic>-harness.ts` exporting `<topic>Harness()`: `hook-harness.ts` (`hookHarness`, `loadModule` for a plain module with mocked imports, both taking module-local names to expose, `flushPromises`), `tv-dom.ts` (a cheerio DOM for `keyboard-navigation.ts`; layout comes from `data-rect="left,top,width,height"`), `tv-navigation-harness.ts` (the real `keyboard-navigation.ts` on a `tv-dom` page), `ebook-harness.ts` (loads the eBook modules and views with mocked imports), `manga-harness.ts` (the real Suwayomi modules over one scripted fake server), `curated-lists-harness.ts` (canon, spine and registry over the bundled list JSON, recording snapshot loads), `subtitle-addon-harness.ts` (subtitle addon provider, search and menu loaders), `player-media-harness.ts` (runs `use-player-media` with its child hooks stubbed; options pick the platform, engine and settings), `cw-advance-harness.ts` (runs `use-cw-advance`), `keyboard-shortcuts-harness.ts` (runs `use-keyboard-shortcuts`), `pick-handler-harness.ts` (runs `use-pick-handler` with a scripted resolver), `autosync-harness.ts` (runs `use-auto-sync` with a scripted outcome and FPS reset), `mpv-bridge-harness.ts` (`transferPrepared` stands in for the prepared-subtitle registry, keyed by the prepared file path; a third argument overrides the provider-URL check), `html5-bridge-harness.ts` (the real html5 bridge on a fake video; a new import in `lib/player/html5/bridge.ts` needs a mock there), `playback-persistence-harness.ts` (`localShared` records the shared flag each local Continue Watching write gets), `subtitle-memory-harness.ts`, `text-sync-harness.ts` (`addResult: false` fails the saved track), plus `cast-ownership.ts`, `elegantfin-dom.ts`, `music-player-dependencies.ts`. Reuse one before hand-rolling mocks.

## Three kinds of test, three ways to break

- Real imports through the loader: break on export renames.
- Source evaluation with a mock `require` that allows only listed imports: a new import in the module fails with `Unexpected import: <path>` until the mock list gets it.
- `readFileSync` + regex on module text (Big Picture, settings panels, player hooks, `updater-experimental`, `games-rom-locales`): a renamed local or reworded literal fails with "did not match". `git grep` the old text in `tests/` before renaming.

## Traps

- Never assert on real elapsed time or a real `setTimeout` wait: the full suite runs files in parallel, and `first-in-order` and `request-scheduler` failed under that load. Use `t.mock.timers.enable({ apis: ["setTimeout", "Date"] })` and `tick()`, or pass a fake `setTimeout` as a global.
- Assertion messages are often prose ("must not refetch metadata"); they describe that test, not a project-wide rule.
- `games-rom-locales.test.ts` reads every `game-rom*`/`game-hack*`/`game-patch*` view and requires each `games.*` key in all 16 locales with matching placeholders.
- `startup-bundle.test.ts` walks the static import graph from `main.tsx`; a new static import of a lazy module fails it.
- Node has no `localStorage`/`indexedDB`; import `_localstorage-stub.ts` / `_indexeddb-stub.ts` (they install a global only if missing) before the module under test reads them at load.
