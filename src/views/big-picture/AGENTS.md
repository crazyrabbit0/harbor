# src/views/big-picture/ (Big Picture / ten-foot UI)

Desktop Big Picture mode and the whole Android TV app. Flat `bp-*.tsx`/`use-bp-*.ts` files plus `addons/ detail/ onboarding/ player/ queue/ search/ sports/`.

## Where to look

| Task                | Location                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Routes / back stack | `src/lib/big-picture.tsx` (`BigPictureRoute`, `pushBigPicture`, `popBigPicture`, `goBigPictureTab`, `exitBigPicture`), `bp-routes.tsx` |
| Shell, tabs, hints  | `bp-shell.tsx`, `bp-top-bar.tsx`, `bp-hint-bar.tsx`                                                                                    |
| Focus engine        | `bp-focus-core.ts` (`applyBpFocus`, `bpRailStep`, `centerScroll`), `use-bp-focus.ts`, styling in `bp-tokens.ts`                        |
| Desktop entry       | `App.tsx` lazy-loads `BigPictureShell`; auto-start/offer logic in `bp-logic.ts`                                                        |
| Android TV entry    | `src/main-tv.tsx` → `bp-tv-app.tsx` (`BP_TV_PROVIDERS`, `setBpTvShell(true)`, overscan default)                                        |
| Player              | `player/` (`bp-player-shell.tsx`, `use-bp-playback.ts`), separate from `views/player/`                                                 |

## Conventions

- Navigation is its own route stack, not `lib/view.tsx`. `useView()` is used only to open the picker and the player overlays.
- Focus lives in DOM attributes, not React state. The engine only sees `data-bp-*`: `focusable`, `focus`, `disabled`, `autofocus`, `row`, `row-key`, `rail-row`, `scroll-x`, `scroll-y`, `center`, `grid`, `tab`, `root`, `overlay`, `dialog`, `restore-key`, `tv`. Mark new layouts with these.
- Playback mounts a second hidden `[data-bp-root]`, so look elements up with `bpFirstVisible` (`bp-visible.ts`), never a bare `querySelector`.
- Lead-tile keys go through `isBpLeadKey` (`label:`, `bp-lead:` prefixes); don't add a third literal prefix.
- `main-tv.tsx` skips `App.tsx`'s bootstrap: it only runs `loadSecrets` and `hydrateCustomThemes` together, then `ensureUiLocale`. Anything the TV needs at startup must be added there.
- The TV bundle has a `chrome87` syntax floor (`vite.config.ts`, `build.target`); nothing checks it, so review new syntax by hand.

## Anti-patterns

- No `:has([data-bp-focus])` row rules: Chromium re-checks them on every focus move (`tests/bp-focus-invalidation.test.ts` guards it).
- No `behavior: "smooth"` on rail tracks; use `glideBpTrack` (`bp-track-glide.ts`).
- Don't bring back the nearest-centre vertical scan in `bp-focus-core.ts`, and don't drop `anchorX` (it makes `setBpAnchorFrom` a silent no-op).
- The TV app must never decline to mount (a kid profile would blank the screen), and `tauri.android.conf.json` must not set `visible: false`.
- Many files here carry multi-line `/* */` rationale blocks; don't copy that style into new code.

## Tests

`tests/big-picture.test.ts` (pure logic), `bp-focus-invalidation`, `bp-tenfoot-canvas` (1140x641, `index-tv.html`), `bp-hero-quality`, `bp-reduced-motion`, `tv-panel-*-contract`. Most read source text, so renames can break them.
