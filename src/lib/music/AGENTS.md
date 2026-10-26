# src/lib/music/ (music frontend logic)

Rust backend notes are in `src-tauri/src/music/AGENTS.md`. UI lives in `src/components/music/`, `src/views/music/` and the DJ deck in `src/views/dj/` + `src/views/dj-deck-app.tsx`.

## Where to look

| Task                            | Location                                                                |
| ------------------------------- | ----------------------------------------------------------------------- |
| Player store and every `invoke` | `player.ts` (~1460 lines; listens to `music://event`, `music://lastfm`) |
| Search across sources           | `sources.ts` (`searchMusic` → `music_search`)                           |
| React binding                   | `use-music-playback.ts`                                                 |
| Main window ↔ DJ deck sync      | `deck-sync.ts`                                                          |

## DJ deck window

- `openDjDeck` (`dj-deck.ts`) opens the `harbor-dj` webview (`index.html?harbor-dj=1`, routed in `src/main.tsx` to `DjDeckApp`).
- The main window broadcasts snapshots on `harbor://music-sync`; the deck sends `harbor://music-command` and asks on `harbor://music-sync-ask` (`answerDeckRequests` replies); handover is acknowledged on `harbor://music-adopted`. The deck drives `music_deck_*` commands directly.
- `deck-sync.ts` skips broadcasting when `isDeckWindow()`; removing that guard makes the deck echo its own state back.
- Two namespaces: `music://` comes from Rust, `harbor://music-*` is window-to-window. A rename on one side breaks silently.

## Tests

The native music DB commands are async and run on one `music-db` worker thread, so two unawaited invokes can reach it in either order; queue and recent writes go through `writeMusicDb` in `player.ts`, which chains each write behind the previous unfinished one.

~120 `tests/music*.test.{ts,mjs}` plus `tests/music/`. A new import in `player.ts` must be added once to `tests/helpers/music-player-dependencies.ts`; `music-player-source-recovery` and `music-surprise` evaluate single functions from `player.ts` and list every free name in their own `scope`.
