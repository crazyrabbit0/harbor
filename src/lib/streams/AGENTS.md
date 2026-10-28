# src/lib/streams/ (stream pipeline)

TS parse/trust/score/rank, plus the stream-plugin subsystem. The Rust half and the Rust ↔ TS file map are in `harbor-core/AGENTS.md`; the play flow from picker to player is in `src/AGENTS.md`.

## Where to look

| Task                         | Location                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestration                | `pipeline.ts` (`runPipeline`; private `runCorePipeline` invokes `streams_run_pipeline`, TS fallback on any error)                           |
| Parse one stream             | `parser/parser-stream.ts` (`parseStream`); always TS, even on desktop                                                                       |
| Drop fakes and mismatches    | `trust.ts` (`applyTrust`, `Rejection`)                                                                                                      |
| Score and tier               | `scoring/` (`scoreStream`, `rankAndPick`, `computeCorpusStats`; `TIER_ORDER` in `scoring-types.ts`)                                         |
| Fetch from addons            | `addons.ts` (`fetchAddonStreams`)                                                                                                           |
| Debrid resolve / cache flags | `resolve.ts` (`resolveStream`, `resolveViaDebrids`), `cached.ts` (`isCached`), `preflight.ts`                                               |
| Safety mode filter           | `mode.ts` (`filterStreamsByMode`)                                                                                                           |
| Anime episode identity       | `anime-identity.ts`, `anime-identity-core.ts`                                                                                               |
| Stream plugins               | `plugins/` (`loadStreamPlugins`, `runStreamPlugin`, `installEntry`, `addStreamRepo`); Android extensions via `plugins/extension/` → capstan |
| Sample payloads              | `__fixtures__/addon-samples.ts` (`ADDON_SAMPLES`), `verify.ts`                                                                              |

## Rules

- Barrels are narrow: `parser.ts` re-exports only `parseStream`/`isTrustedGroup`, `scoring.ts` only the three entry functions and their types. Import penalty helpers from their own file.
- The Off and Show all safety modes bypass the pre-filter as well as the trust checks (`pipeline.ts`); an unknown mode value falls back to the safest one (`mode.ts`).
- An older async parse must never replace a completed picker (`pipeline.ts`); keep the generation check when adding async steps.
- A network-failed AniZip lookup must not stick for the session; only real misses are cached (`anime-identity.ts`).
- Title matching is token-exact: "Dune" must not resolve as "Dune Part Two" (`plugins/extension/detail.ts`).
- Plugin request headers must not carry CR, LF, NUL or DEL (`plugins/adapter.ts`).

## Tests

~40 files in `tests/` import from `lib/streams/` (mostly `stream-*`, `stream-plugins-*`, `plugin-*`; `git grep -l lib/streams/ -- tests` finds the rest). They exercise the TS implementation only.
