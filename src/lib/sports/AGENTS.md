# src/lib/sports/ (sports and esports data)

Framework-free data layer for the Sports room. UI is `src/views/sports/` (flat, plus `pitch/`); it calls no Tauri command except `browser_open`/`pip_open` in `embedded-broadcast-player.tsx`.

## Where to look

| Task                         | Location                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Providers                    | `provider.ts` (`SportsProvider`, `SPORTS_PROVIDERS` = ESPN, API-Sports, TheSportsDB; `SLICE_CONCURRENCY` 6), `espn-*.ts`, `providers/`     |
| Hub cache                    | `hub-cache.ts` (90 s fresh, `@upcoming` keys 15 min; `reconcileSportsGames` keeps object identity), `slice-storage.ts`, `api-hub-cache.ts` |
| League/team/athlete metadata | `competition-metadata.ts` (TheSportsDB + ESPN merge), `team-catalog*.ts`, `athlete-*.ts`                                                   |
| Esports                      | `esports-*.ts` (~25: Liquipedia, bo3.gg, OpenDota, Riot ddragon, valorant-api, maps)                                                       |
| Motorsport / boxing          | `f1-data.ts` (Jolpica), `motorsport-schedule-cache.ts`, `providers/boxing-*`                                                               |
| Consent, terms, favourites   | `consent.ts`, `usage-notice.ts`, `personalization.ts`, `favourites.ts`, `reminders.ts`                                                     |

## Rules

- `hub-runtime.ts` must load without initialising the native or network layers; keep its imports pure.
- An empty personal selection stays empty: never restore starter teams (`personalization.ts`), and the football aggregate must not widen a selection.
- A changed provider participant must not inherit another team's badge or score (`event-enrichment.ts`); missing or placeholder art never replaces existing art.
- Provider error messages are never shown to the user, since they can echo credentials (`providers/api-sports-transport.ts`).
- Schedule feeds are not live scoreboards (`additional-sports-catalog.ts`); don't render them as live.
- Liquipedia: use the API (`api.php`) with the identifying `User-Agent` (`AGENT`, pointing at this fork's GitHub repo and issues; Liquipedia blocks anonymous clients), keep the CC BY-SA attribution, and parse venue `[url Label]` markup instead of rendering it raw. Map images stay attributed and are not redistributed (`esports-extra-maps.ts`, `usage-notice.ts`).
- Esports rosters fall back to team rosters only when match rosters are absent, never mixing eras (`esports-cs-detail.ts`).
- Watch sources reuse the Live TV guide; `views/sports/watch-sources.tsx` must not download whole XMLTV feeds.

## Browser build

Most sports hosts (ESPN, TheSportsDB, Liquipedia, bo3.gg, OpenDota, Jolpica) are in neither `PROXY_HOSTS` (`lib/safe-fetch.ts`) nor the `vite.config.ts` proxy, so in a plain browser they rely on the host's own CORS. Add a host to both lists if it fails there.

## Tests

~67 `tests/sports-*.test.ts` (e.g. `sports-hub`, `sports-competition-metadata`, `sports-esports-*`, `sports-athlete-*`, `sports-boxing-*`, `sports-api-*`, `sports-worker-lifecycle`).
