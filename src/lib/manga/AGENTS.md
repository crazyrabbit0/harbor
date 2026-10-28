# src/lib/manga/ (manga sources, cache, tracking)

Framework-free manga logic. UI is `src/views/manga/`: `manga-reader/` (reader, phone remote), `manga-sources-panel/` (source and plugin management, `suwayomi/` UI), `manga-browse/`, `manga-detail/`. Community source list: `data/manga-sources.json` (root `AGENTS.md`).

## Where to look

| Task                 | Location                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch + cache facade | `api.ts` (memory `Map` + localStorage `harbor.manga.cache.v2.*`, 7-day disk max; 12 s call / 25 s pages timeout, 2 tries)                                                |
| Source registry      | `sources.ts` (configured, custom, resolved, active, migrated keys in localStorage)                                                                                       |
| Source types         | `sources/suwayomi/` (server + extension repos), `sources/mangayomi.ts` + `sources/mangayomi/` (IndexedDB store), `sources/html.ts`, `cbz.ts`, `local.ts`, `aggregate.ts` |
| JS plugins           | `plugins/` (IndexedDB `harbor-manga-plugins`, `sandbox.ts` blocked globals, `worker-host.ts` RPC)                                                                        |
| Opening a title      | `open-resolve.ts`                                                                                                                                                        |
| Metadata / trackers  | `mangaupdates.ts` (7 days, 350 ms throttle), `tracking-anilist.ts`, `tracking-mal.ts`, `sync.ts`, `collections.ts` (24 h, revision-keyed)                                |
| Rate limiting        | `types.ts` `mangaThrottle(gapMs)`, shared by Suwayomi, HTML sources and MangaUpdates                                                                                     |

## Rules

- Empty results are never written to the disk cache (`api.ts` `diskWrite`).
- A stored source ID is trusted only while its detail still matches the saved title, and a match is never guessed from the first search result (`open-resolve.ts`).
- Suwayomi browse cursors reset whenever a server's source list changes (`sources/suwayomi/provider.ts`). Its feed (`api.ts` `FEED_TTL`) and popular list (`POPULAR_CACHE_TTL`) are two separate 5-minute caches.
- Plugins run in a worker with `indexedDB`, `caches`, `Worker` and similar globals blocked; the contract shown to authors is `views/manga/manga-sources-panel/plugin-guide.tsx` (absolute http(s) image URLs, no `chapter.downloaded`, no volumes derived from titles). Change the guide and `sandbox.ts` together.
- The custom-source legal copy ("bypasses no password, paywall, or access control…") is translated in every locale; edit its wording only through `lib/i18n`.
- The reader fetches images through `invoke("harbor_fetch")` (`manga-reader/reader-utils.ts`) and the phone remote uses `lan_ip`.

## Tests

`tests/manga-*` (6), `suwayomi-*` (3), `addon-suwayomi-recovery.test.mjs`. Mangayomi sources have no tests.
