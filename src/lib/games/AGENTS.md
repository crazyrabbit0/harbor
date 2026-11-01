# src/lib/games/ (game library logic)

Framework-free logic for the Games room: IGDB, ROMs and emulation, launchers, Steam, Minecraft, Sims, Stardew, WoW, Pokémon, downloads, cloud/debrid sources. Rust backend notes are in `src-tauri/games/AGENTS.md`; UI lives in `src/views/games/` and `src/hooks/use-game-*.ts`.

## Where to look

| Task                 | Location                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| IGDB                 | `igdb-client.ts` (`igdbRequest`, token in localStorage `harbor.igdb.token.v1`, throws `IgdbNotConfiguredError` without credentials) |
| Emulator / ROM types | `emulation.ts`, `rom-*.ts`                                                                                                          |
| Cross-media links    | `cross-media.ts`                                                                                                                    |
| Store-style sources  | `source-*.ts`, `cloud-*.ts`, `download-*.ts`                                                                                        |
| Bundled data         | `audience-chart-snapshot.json`, `retro-logo-index.json`                                                                             |

## Identity rules

- Never join games by title. Wikidata P5794 holds an IGDB slug, not the numeric API ID (`cross-media.ts`); match by IDs (`discovery-picker-source.ts`).
- AI search must not swap in a similarly named sequel (`ai-search.ts`).
- Rejected credentials never become an estimate (`completion-times.ts`).
- Cloud web store submissions record intent before contacting the service and never auto-retry an ambiguous submission (`cloud-web-store.ts`, intents in IndexedDB).

## Tests

`tests/games-*.test.ts` (and `games-source-verification-read.test.mjs`), e.g. `games-igdb-cache`, `games-emulation`, `games-rom-*`, `games-launcher-*`, `games-steam-*`, `games-pokemon*`. IGDB fixture: `tests/fixtures/igdb-age-ratings.json`.
