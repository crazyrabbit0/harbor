# tests/ (Node test suite)

Loader, single-file command and the source-regex trap are in the root `AGENTS.md`. This file covers the folder's own conventions.

## Layout

- Flat `tests/<topic>.test.ts` (~825) and `.test.mjs` (~30, plain JS). Families share a prefix: `games-*`, `music-*`, `sports-*`, `manga-*`, `player-*`, `plugin-*`, `stream-plugins-*`, `cw-*`, `p2p-*`, `addon-*`, `tracker-*`, `skip-*`, `anime-*`, `bp-*`, `tv-panel-*`, `settings-*`. Name a new file after the family it joins.
- `tests/_*.ts` are shared stubs (`_localstorage-stub.ts`, `_indexeddb-stub.ts`, `_tv-panel-kotlin.ts`, `_tv-panel-kt-lex.ts`); the leading `_` keeps them out of the glob. `tests/music/` (2 files) and `tests/fixtures/` are subfolders the glob skips, so a `.test.ts` placed there never runs under `pnpm test`.
- `tests/helpers/` holds harness factories named `<topic>-harness.ts` exporting `<topic>Harness()`: `hook-harness.ts` (`hookHarness`, `loadModule` for a plain module with mocked imports, both taking module-local names to expose, `flushPromises`), `tree-render.ts` (`treeHarness`: one fake React with `lazy`, `Suspense`, transitions and context providers that renders whole trees or runs a hook as one pass; `component-harness.ts` renders one component on it), `tv-dom.ts` (a cheerio DOM for `keyboard-navigation.ts`; layout comes from `data-rect="left,top,width,height"`), `tv-navigation-harness.ts` (the real `keyboard-navigation.ts` on a `tv-dom` page), `ebook-harness.ts` (loads the eBook modules and views with mocked imports), `manga-harness.ts` (the real Suwayomi modules over one scripted fake server), `curated-lists-harness.ts` (canon, spine and registry over the bundled list JSON, recording snapshot loads), `subtitle-addon-harness.ts` (subtitle addon provider, search and menu loaders), `player-media-harness.ts` (runs `use-player-media` with its child hooks stubbed; options pick the platform, engine and settings), `cw-advance-harness.ts` (runs `use-cw-advance`), `keyboard-shortcuts-harness.ts` (runs `use-keyboard-shortcuts`), `pick-handler-harness.ts` (runs `use-pick-handler` with a scripted resolver), `autosync-harness.ts` (runs `use-auto-sync` with a scripted outcome and FPS reset), `mpv-bridge-harness.ts` (`transferPrepared` stands in for the prepared-subtitle registry, keyed by the prepared file path; a third argument overrides the provider-URL check), `html5-bridge-harness.ts` (the real html5 bridge on a fake video; a new import in `lib/player/html5/bridge.ts` needs a mock there), `playback-persistence-harness.ts` (`localShared` records the shared flag each local Continue Watching write gets), `subtitle-memory-harness.ts`, `text-sync-harness.ts` (`addResult: false` fails the saved track), plus `cast-ownership.ts`, `elegantfin-dom.ts`, `music-player-dependencies.ts`. Reuse one before hand-rolling mocks.

## Write tests that run the code

- A new test runs the code it checks: a real import through the loader, or `hookHarness`/`loadModule` for hooks, components and modules with awkward imports. Render a component with a mocked `react/jsx-runtime` and assert on the tree and its handlers.
- Never add a `readFileSync` + regex check on a module's source. It passes while the behaviour breaks and fails on a harmless rename. About 90 files still match TypeScript source as text, many only for the kinds allowed below; when you touch one, convert the checks you need.
- Text checks are acceptable only where nothing can run: CSS, Rust sources, locale and data files, and one exact line of wiring in a view too large to load (over about 1,000 lines or with an unmanageable import graph). `startup-bundle`, `games-rom-locales` and `harbor-events` scan source on purpose.
- Never pin UI wording in a test; assert translation keys, roles, props and calls instead.
- Prove a new test can fail: break the code it covers (a wrong condition, a removed call) and confirm the test goes red, then restore the code.

## How each kind of test breaks

- Real imports through the loader: break on export renames.
- Source evaluation with a mock `require` that allows only listed imports (`hookHarness`, `loadModule`): a new import in the module fails with `Unexpected import: <path>` or `Unexpected dependency <path>` until the mock list gets it.
- The remaining `readFileSync` + regex tests (Big Picture, settings panels, some player hooks, `updater-experimental`): a renamed local or reworded literal fails with "did not match". `git grep` the old text in `tests/` before renaming.

## Traps

- Never assert on real elapsed time or a real `setTimeout` wait: the full suite runs files in parallel, and `first-in-order` and `request-scheduler` failed under that load. Use `t.mock.timers.enable({ apis: ["setTimeout", "Date"] })` and `tick()`, or pass a fake `setTimeout` as a global.
- Assertion messages are often prose ("must not refetch metadata"); they describe that test, not a project-wide rule.
- `games-rom-locales.test.ts` reads every `game-rom*`/`game-hack*`/`game-patch*` view and requires each `games.*` key in all 16 locales with matching placeholders.
- `startup-bundle.test.ts` walks the static import graph from `main.tsx`; a new static import of a lazy module fails it.
- Node has no `localStorage`/`indexedDB`; import `_localstorage-stub.ts` / `_indexeddb-stub.ts` (they install a global only if missing) before the module under test reads them at load.
