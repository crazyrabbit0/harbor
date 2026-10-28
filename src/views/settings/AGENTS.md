# src/views/settings/ (Settings UI)

How to add a setting, a page, rows and search entries is in `src/AGENTS.md` ("Settings"). This file covers the cross-panel machinery. Panels live in `<name>-panel/`; `theme-panel/` (~140 files: `custom-themes-section/`, `theme-studio/`) is the largest.

## Sub-tabs and deep links

- A panel declares tabs with `useSubTabs(tabs, value, onChange)` (`sub-tabs.tsx`), which registers into `SubTabsProvider` for the sidebar. The registration key includes `label`, `icon`, `dot` and `count`, so changing a count re-registers. In dev, `assertTabRegistry` warns when tab ids drift from `SECTION_TABS` (`tab-registry.ts`); keep both in step.
- Search and deep links go through `useSettingsAnchor({ anchor, tab? })` (`anchor-navigation.ts`). With `tab`, it waits until that tab is the registered one before resolving, so a same-named anchor in the tab being left is never used; without it, it walks the other tabs. It retries every 50 ms, 30 times.
- An anchor resolves only if it is rendered (`getClientRects().length > 0`); hidden duplicates are skipped, so ids must be unique per visible panel.
- The jump highlight `.hset-jumped` is global in `src/index.css` and reused by `views/manga/manga-library.tsx`; don't rename it or add a settings-only copy.

## Side-effect imports in `views/settings.tsx`

- `import "./settings/tv-panel/store"` registers TV settings' profile-sync section at module load, and `theme-panel/library-open-store` does the same for the theme library. They look unused; removing either silently drops that behaviour.

## TV panel

- `tv-panel/mirror.ts` `buildMirrorPlan` is pure and clamps what desktop settings send to the TV (subtitle size 60–260 step 10, opacity 30–100 step 5, box opacity 0–100 step 5). `MIRROR_SKIPPED` lists what is deliberately not sent; a new mirrored field moves out of that list.
- `tv-panel-layout-contract` and `tv-panel-settings-contract` tests import `tv-panel/model.ts` and `model-look.ts`; keep their exports stable.

## Traps

- `player-panel/display-picker.tsx`: when the chosen monitor is gone, Rust falls back to Automatic without telling the UI; keep the stored value separate from the one shown.
- Many tests read panel source as text (`player-layout-*`, `plugin-*`, `theme-*`, `updater-experimental` over `updates-panel`/`advanced-panel/system-tab`, `card-artwork-state`, `settings-refresh-regression`, `content-advisory-settings`). Renaming a prop or local in those panels can fail an unrelated test; `git grep` the old name in `tests/` first.
- `player-layout-drag.test.ts` imports `placeControl` from `player-layout-panel/config-helpers.ts`.
- `theme-panel/startup-artwork.css` is the only CSS file here; panels style through `index.css` tokens and the row primitives.
