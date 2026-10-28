//! Harbor shared protocol core.
//!
//! Hosts the pure-function pieces of the Stremio addon protocol pipeline so the same
//! logic can run in the WebView via wasm-bindgen and in native shells via direct rlib
//! linkage.

pub mod parser;
pub mod scoring;
pub mod trust;

mod types;

pub use types::*;

use wasm_bindgen::prelude::*;

fn to_js_err<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&format!("{e}"))
}

fn options_or_default<T: Default + serde::de::DeserializeOwned>(v: JsValue) -> Result<T, JsValue> {
    if v.is_undefined() || v.is_null() {
        Ok(T::default())
    } else {
        serde_wasm_bindgen::from_value(v).map_err(to_js_err)
    }
}

#[wasm_bindgen]
pub fn harbor_core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[wasm_bindgen(start)]
pub fn _start() {}

/// Parse a single raw addon `Stream` into a fully-resolved `ParsedStream`.
/// JS shape on input: { addonId, addonName, name?, title?, description?, url?, infoHash?, fileIdx?, behaviorHints?, ... }
/// JS shape on output: ParsedStream (extends Stream + parsing fields).
#[wasm_bindgen(js_name = parseStream)]
pub fn parse_stream_js(stream: JsValue) -> Result<JsValue, JsValue> {
    let s: Stream = serde_wasm_bindgen::from_value(stream).map_err(to_js_err)?;
    let parsed = parser::parse_stream(s);
    serde_wasm_bindgen::to_value(&parsed).map_err(to_js_err)
}

/// Parse many streams in one call. Cheaper than N individual calls (one FFI hop instead of N).
#[wasm_bindgen(js_name = parseStreams)]
pub fn parse_streams_js(streams: JsValue) -> Result<JsValue, JsValue> {
    let v: Vec<Stream> = serde_wasm_bindgen::from_value(streams).map_err(to_js_err)?;
    let parsed: Vec<ParsedStream> = v.into_iter().map(parser::parse_stream).collect();
    serde_wasm_bindgen::to_value(&parsed).map_err(to_js_err)
}

/// Filter a slice of `ParsedStream`s through the trust gate.
/// Returns `{ keep: ParsedStream[], rejected: { stream, reason }[] }`.
#[wasm_bindgen(js_name = applyTrust)]
pub fn apply_trust_js(streams: JsValue, opts: JsValue) -> Result<JsValue, JsValue> {
    let v: Vec<ParsedStream> = serde_wasm_bindgen::from_value(streams).map_err(to_js_err)?;
    let opts: TrustOptions = options_or_default(opts)?;
    let result = trust::apply_trust(v, &opts);
    let out = TrustResultJs {
        keep: result.keep,
        rejected: result.rejected,
    };
    serde_wasm_bindgen::to_value(&out).map_err(to_js_err)
}

/// Compute corpus-wide stats (median size, p90 size, etc.) needed to score individual streams.
#[wasm_bindgen(js_name = computeCorpusStats)]
pub fn compute_corpus_stats_js(streams: JsValue, opts: JsValue) -> Result<JsValue, JsValue> {
    let v: Vec<ParsedStream> = serde_wasm_bindgen::from_value(streams).map_err(to_js_err)?;
    let opts: ScoreOptions = options_or_default(opts)?;
    let stats = scoring::compute_corpus_stats(&v, &opts);
    serde_wasm_bindgen::to_value(&CorpusStatsJs::from(stats)).map_err(to_js_err)
}

/// Score one parsed stream given options + corpus stats. Returns `ScoredStream`.
#[wasm_bindgen(js_name = scoreStream)]
pub fn score_stream_js(
    parsed: JsValue,
    opts: JsValue,
    corpus: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed: ParsedStream = serde_wasm_bindgen::from_value(parsed).map_err(to_js_err)?;
    let opts: ScoreOptions = options_or_default(opts)?;
    let stats: scoring::CorpusStats = if corpus.is_undefined() || corpus.is_null() {
        scoring::CorpusStats::default()
    } else {
        let stats_js: CorpusStatsJs = serde_wasm_bindgen::from_value(corpus).map_err(to_js_err)?;
        stats_js.into()
    };
    let scored = scoring::score_stream(parsed, &opts, &stats);
    serde_wasm_bindgen::to_value(&scored).map_err(to_js_err)
}

/// One-shot pipeline: parse + trust + score + rank + pick. The expected workflow for most callers.
/// `streams` is a `Stream[]` (raw, unparsed), `trust` and `score` are options objects.
/// Returns `{ picker: RankedPicker, rejected: Rejection[] }`.
#[wasm_bindgen(js_name = runPipelinePure)]
pub fn run_pipeline_pure_js(
    streams: JsValue,
    trust_opts: JsValue,
    score_opts: JsValue,
) -> Result<JsValue, JsValue> {
    let raw: Vec<Stream> = serde_wasm_bindgen::from_value(streams).map_err(to_js_err)?;
    let trust_opts: TrustOptions = options_or_default(trust_opts)?;
    let score_opts: ScoreOptions = options_or_default(score_opts)?;

    let parsed: Vec<ParsedStream> = raw.into_iter().map(parser::parse_stream).collect();
    let trust_result = trust::apply_trust(parsed, &trust_opts);
    let corpus = scoring::compute_corpus_stats(&trust_result.keep, &score_opts);
    let scored: Vec<ScoredStream> = trust_result
        .keep
        .into_iter()
        .map(|p| scoring::score_stream(p, &score_opts, &corpus))
        .collect();
    let picker = scoring::rank_and_pick(
        scored,
        &score_opts.active_debrids,
        score_opts.respect_addon_order,
    );

    let out = PipelineResultJs {
        picker,
        rejected: trust_result.rejected,
    };
    serde_wasm_bindgen::to_value(&out).map_err(to_js_err)
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrustResultJs {
    keep: Vec<ParsedStream>,
    rejected: Vec<Rejection>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineResultJs {
    picker: RankedPicker,
    rejected: Vec<Rejection>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpusStatsJs {
    days_since_release: Option<f64>,
    trusted_tracked_fraction: f64,
    theater_capture_fraction: f64,
    webish_fraction: f64,
    trusted_tracked_count: usize,
    median_size: Option<u64>,
    p90_size: Option<u64>,
    p10_seeders: Option<u32>,
    p90_seeders: Option<u32>,
}

impl From<scoring::CorpusStats> for CorpusStatsJs {
    fn from(s: scoring::CorpusStats) -> Self {
        Self {
            days_since_release: s.days_since_release,
            trusted_tracked_fraction: s.trusted_tracked_fraction,
            theater_capture_fraction: s.theater_capture_fraction,
            webish_fraction: s.webish_fraction,
            trusted_tracked_count: s.trusted_tracked_count,
            median_size: s.median_size,
            p90_size: s.p90_size,
            p10_seeders: s.p10_seeders,
            p90_seeders: s.p90_seeders,
        }
    }
}

impl From<CorpusStatsJs> for scoring::CorpusStats {
    fn from(s: CorpusStatsJs) -> Self {
        Self {
            days_since_release: s.days_since_release,
            trusted_tracked_fraction: s.trusted_tracked_fraction,
            theater_capture_fraction: s.theater_capture_fraction,
            webish_fraction: s.webish_fraction,
            trusted_tracked_count: s.trusted_tracked_count,
            median_size: s.median_size,
            p90_size: s.p90_size,
            p10_seeders: s.p10_seeders,
            p90_seeders: s.p90_seeders,
        }
    }
}
