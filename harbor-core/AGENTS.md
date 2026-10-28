# harbor-core/ (Rust stream engine)

Pure Rust parse → trust → score → rank, built as `cdylib` + `rlib`. `src-tauri` links the `rlib`; the wasm build is CI-only. TS mirror: `src/lib/streams/` (see its AGENTS.md).

## What actually runs

- Desktop calls only `streams_run_pipeline` (`src-tauri/src/streams.rs`): `trust::apply_trust` → `scoring::compute_corpus_stats` → `score_stream` → `rank_and_pick`, on streams parsed by the TS `parseStream`.
- `parser.rs` reaches the app nowhere: `streams_parse` and `streams_core_version` are registered in `lib.rs`/`mobile.rs` but have no frontend caller, and the wasm exports in `src/lib.rs` (`parseStream`, `runPipelinePure`, …) are unused. A parser fix belongs in `src/lib/streams/parser/` first.
- The pipeline order is written twice: `run_pipeline_pure_js` in `src/lib.rs` and `streams_run_pipeline` in `src-tauri`. Change both together.

## Rust ↔ TS map

| Rust                                                                 | TS                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.rs`                                                           | `src/lib/streams/types.ts` (serde `camelCase`; a renamed field breaks the invoke silently)                                                                                |
| `parser.rs` (one file)                                               | `parser/parser-*.ts` split by concern (`parser-stream.ts` `parseStream`, `parser-trusted-groups.ts` `isTrustedGroup`, …)                                                  |
| `trust.rs`                                                           | `trust.ts` (`applyTrust`, `titleMatches`, `titleTokensPresent`)                                                                                                           |
| `scoring.rs` `score_stream`, `rank_and_pick`, `compute_corpus_stats` | `scoring/scoring-stream.ts`, `scoring-rank.ts`, `scoring-corpus.ts`                                                                                                       |
| `scoring.rs` penalty helpers                                         | one file per family: `scoring-size.ts`, `scoring-bitrate.ts`, `scoring-audio.ts`, `scoring-addons.ts`, `scoring-recency.ts`, `scoring-debrid.ts`, `scoring-resolution.ts` |

- No parity test exists: `tests/` covers only the TS side. A trust or scoring change made on one side must be ported by hand, or desktop and browser rank differently.

## Checks

- Inside `harbor-core/`: `cargo test --all-targets`, `cargo clippy --all-targets -- -D warnings`, `cargo check --target wasm32-unknown-unknown`. CI also runs `wasm-pack build --target bundler` on Linux, macOS and Windows.
- CI never runs `cargo fmt`, and only `src/lib.rs` is rustfmt-clean; formatting the rest rewrites ~750 lines and unpacks the hand-aligned language and group tables, so don't run it inside a feature diff.
- Release profile is `opt-level = "z"` for the wasm size; it doesn't apply when `src-tauri` builds the crate, which uses the app's profile.
