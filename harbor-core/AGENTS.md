# harbor-core/ (Rust stream engine)

Pure Rust parse → trust → score → rank, built as `cdylib` + `rlib`. `src-tauri` links the `rlib`; the wasm build is CI-only. TS mirror: `src/lib/streams/` (see its AGENTS.md).

## What actually runs

- Desktop calls only `streams_run_pipeline` (`src-tauri/src/streams.rs`): `trust::apply_trust` → `scoring::compute_corpus_stats` → `score_stream` → `rank_and_pick`, on streams parsed by the TS `parseStream`.
- `parser.rs` reaches the app nowhere: `streams_parse` and `streams_core_version` are registered in `lib.rs`/`mobile.rs` but have no frontend caller, and the wasm exports in `src/lib.rs` (`parseStream`, `runPipelinePure`, …) are unused. A parser fix belongs in `src/lib/streams/parser/` first.
- The pipeline order is written twice: `run_pipeline_pure_js` in `src/lib.rs` and `streams_run_pipeline` in `src-tauri`. Change both together.

## Rust ↔ TS map

| Rust                                                                 | TS                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.rs`                                                           | `src/lib/streams/types.ts` (serde `camelCase`; a renamed field breaks the invoke silently). The enums are generated into `src/lib/generated/streams-ipc.ts`               |
| `parser.rs` (one file)                                               | `parser/parser-*.ts` split by concern (`parser-stream.ts` `parseStream`, `parser-trusted-groups.ts` `isTrustedGroup`, …)                                                  |
| `trust.rs`                                                           | `trust.ts` (`applyTrust`, `titleMatches`, `titleTokensPresent`)                                                                                                           |
| `scoring.rs` `score_stream`, `rank_and_pick`, `compute_corpus_stats` | `scoring/scoring-stream.ts`, `scoring-rank.ts`, `scoring-corpus.ts`                                                                                                       |
| `scoring.rs` penalty helpers                                         | one file per family: `scoring-size.ts`, `scoring-bitrate.ts`, `scoring-audio.ts`, `scoring-addons.ts`, `scoring-recency.ts`, `scoring-debrid.ts`, `scoring-resolution.ts` |

- The enums in `types.rs` (`Resolution`, `HdrFormat`, `Codec`, `AudioCodec`, `Source`, `Tier`, `DebridSlug`, `Container`) derive `ts_rs::TS` behind the optional `ts` feature, which only `src-tauri`'s dev-dependency enables; `streams_ipc::tests::export_bindings` there writes them to `src/lib/generated/streams-ipc.ts`, which `types.ts` re-exports. A new variant or rename shows up as a stale-binding failure in `cargo test`. The structs stay hand-mirrored, since their `#[serde(flatten)]` maps and the TS-only fields have no faithful ts-rs form.
- Parity is tested only for the episode rule: `tests/fixtures/trust-episode-parity.json` runs through `trust::tests::episode_rule_matches_ts_fixture` and `tests/stream-trust-episode-parity.test.ts` (TS `applyTrust`); add a case to it with any trust change. Everything else in trust and scoring must be ported by hand, or desktop and browser rank differently. Known remaining gaps: Rust parses only `YYYY-MM-DD` release dates for the cinema window, and treats a string `videoSize` as absent.
- Shared rules that must match: `rank_and_pick` / `rankAndPick` sort by score (or addon order), put cached streams first in `all`, and take the first cached non-cinema stream as primary, then the first non-cinema stream, so a CAM/TS/HDTS/TC is the pick only when nothing else exists; ties go to the earlier stream. A stream with a URL counts as cached only without an uncached marker (`UNCACHED_MARKER_RX`, mirrored from `cached.ts`, Unicode flag on both). The trailer filter ignores words that belong to the expected title (`without_title_words` / `withoutTitleWords`). Only the browser build applies the AAC preference.

## Checks

- Inside `harbor-core/`: `cargo test --all-targets`, `cargo clippy --all-targets -- -D warnings`, `cargo check --target wasm32-unknown-unknown`. CI also runs `wasm-pack build --target bundler` on Linux, macOS and Windows.
- CI never runs `cargo fmt`, and only `src/lib.rs` is rustfmt-clean; formatting the rest rewrites ~750 lines and unpacks the hand-aligned language and group tables, so don't run it inside a feature diff.
- Release profile is `opt-level = "z"` for the wasm size; it doesn't apply when `src-tauri` builds the crate, which uses the app's profile.
