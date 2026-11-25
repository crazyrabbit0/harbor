//! Typed replies of the extension bridge (`android-extension-compat/docs/BRIDGE.md`), read leniently from its JSON.

use harbor_shared::lenient;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanPing {
    #[serde(deserialize_with = "lenient::value")]
    pub pong: bool,
    #[serde(deserialize_with = "lenient::value")]
    pub protocol: u32,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "number"))]
    pub extensions: u64,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "number"))]
    pub providers: u64,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanUnavailable {
    #[serde(deserialize_with = "lenient::value")]
    pub method: String,
    #[serde(deserialize_with = "lenient::value")]
    pub descriptor: String,
    #[serde(deserialize_with = "lenient::value")]
    pub reason: String,
}

/// One installed extension; `providers` holds the ids of the providers it registered.
#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanExtension {
    #[serde(deserialize_with = "lenient::value")]
    pub id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub version: i32,
    #[serde(deserialize_with = "lenient::value")]
    pub entry_class: String,
    #[serde(deserialize_with = "lenient::value")]
    pub file: String,
    #[serde(deserialize_with = "lenient::value")]
    pub source: String,
    #[serde(deserialize_with = "lenient::list")]
    pub providers: Vec<String>,
    #[serde(deserialize_with = "lenient::list")]
    pub extractors: Vec<String>,
    #[serde(deserialize_with = "lenient::list")]
    pub unavailable: Vec<CapstanUnavailable>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanUninstall {
    #[serde(deserialize_with = "lenient::value")]
    pub id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub file_removed: bool,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanExtensions {
    #[serde(deserialize_with = "lenient::list")]
    pub extensions: Vec<CapstanExtension>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeProvider {
    #[serde(deserialize_with = "lenient::value")]
    pub id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub extension_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub lang: String,
    #[serde(deserialize_with = "lenient::value")]
    pub main_url: String,
    #[serde(deserialize_with = "lenient::list")]
    pub types: Vec<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub has_quick_search: bool,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanProviders {
    #[serde(deserialize_with = "lenient::list")]
    pub providers: Vec<BridgeProvider>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeSearchItem {
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub url: String,
    #[serde(deserialize_with = "lenient::value")]
    pub r#type: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub poster_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub quality: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanSearch {
    #[serde(deserialize_with = "lenient::value")]
    pub provider_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub page: u32,
    #[serde(deserialize_with = "lenient::list")]
    pub results: Vec<BridgeSearchItem>,
    #[serde(deserialize_with = "lenient::value")]
    pub note: Option<String>,
}

/// `airDate` is an epoch in whichever unit the provider used.
#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeEpisode {
    #[serde(deserialize_with = "lenient::value")]
    pub data: String,
    #[serde(deserialize_with = "lenient::value")]
    pub name: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub season: Option<i32>,
    #[serde(deserialize_with = "lenient::value")]
    pub episode: Option<i32>,
    #[serde(deserialize_with = "lenient::value")]
    pub poster_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub description: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub runtime_minutes: Option<i32>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "number | null"))]
    pub air_date: Option<i64>,
    #[serde(deserialize_with = "lenient::value")]
    pub track: String,
}

/// `score` is the provider's own score out of ten, never an IMDb rating.
#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeMedia {
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub url: String,
    #[serde(deserialize_with = "lenient::value")]
    pub r#type: String,
    #[serde(deserialize_with = "lenient::value")]
    pub poster_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub background_poster_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub year: Option<i32>,
    #[serde(deserialize_with = "lenient::value")]
    pub plot: Option<String>,
    #[serde(deserialize_with = "lenient::list")]
    pub tags: Vec<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub duration_minutes: Option<i32>,
    #[serde(deserialize_with = "lenient::value")]
    pub content_rating: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub score: Option<f64>,
    #[serde(deserialize_with = "lenient::value")]
    pub coming_soon: bool,
    #[serde(deserialize_with = "lenient::value")]
    pub playable_data: Option<String>,
    #[serde(deserialize_with = "lenient::list")]
    pub episodes: Vec<BridgeEpisode>,
    #[serde(deserialize_with = "lenient::list")]
    pub recommendations: Vec<BridgeSearchItem>,
    #[serde(deserialize_with = "lenient::list")]
    pub actors: Vec<String>,
    #[serde(deserialize_with = "lenient::list")]
    pub trailer_urls: Vec<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub sync_ids: HashMap<String, String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanLoad {
    #[serde(deserialize_with = "lenient::value")]
    pub provider_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub found: bool,
    #[serde(deserialize_with = "lenient::value")]
    pub result: Option<BridgeMedia>,
    #[serde(deserialize_with = "lenient::value")]
    pub note: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeLink {
    #[serde(deserialize_with = "lenient::value")]
    pub source: String,
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub url: String,
    #[serde(deserialize_with = "lenient::value")]
    pub referer: String,
    #[serde(deserialize_with = "lenient::value")]
    pub quality: i32,
    #[serde(deserialize_with = "lenient::value")]
    pub r#type: String,
    #[serde(deserialize_with = "lenient::value")]
    pub headers: HashMap<String, String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeSubtitle {
    #[serde(deserialize_with = "lenient::value")]
    pub lang: String,
    #[serde(deserialize_with = "lenient::value")]
    pub url: String,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanLinks {
    #[serde(deserialize_with = "lenient::value")]
    pub provider_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub success: bool,
    #[serde(deserialize_with = "lenient::list")]
    pub links: Vec<BridgeLink>,
    #[serde(deserialize_with = "lenient::list")]
    pub subtitles: Vec<BridgeSubtitle>,
    #[serde(deserialize_with = "lenient::value")]
    pub note: Option<String>,
}

/// One row a provider offers to browse; `declared` is false only for the row the layer stands up for a provider that names none.
#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeCatalogueRow {
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub horizontal_images: bool,
    #[serde(default = "declared_default", deserialize_with = "declared")]
    pub declared: bool,
}

fn declared_default() -> bool {
    true
}

// Only an explicit `false` marks a row as undeclared.
fn declared<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    Ok(Value::deserialize(deserializer)? != Value::Bool(false))
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanCatalogue {
    #[serde(deserialize_with = "lenient::value")]
    pub provider_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub has_main_page: bool,
    #[serde(deserialize_with = "lenient::list")]
    pub rows: Vec<BridgeCatalogueRow>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct BridgeCatalogueSection {
    #[serde(deserialize_with = "lenient::value")]
    pub name: String,
    #[serde(deserialize_with = "lenient::value")]
    pub horizontal_images: bool,
    #[serde(deserialize_with = "lenient::list")]
    pub items: Vec<BridgeSearchItem>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CapstanCataloguePage {
    #[serde(deserialize_with = "lenient::value")]
    pub provider_id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub row: String,
    #[serde(deserialize_with = "lenient::value")]
    pub page: u32,
    #[serde(deserialize_with = "lenient::value")]
    pub has_next: bool,
    #[serde(deserialize_with = "lenient::list")]
    pub sections: Vec<BridgeCatalogueSection>,
    #[serde(deserialize_with = "lenient::value")]
    pub note: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        let decls = [
            CapstanPing::decl(&cfg),
            CapstanUnavailable::decl(&cfg),
            CapstanExtension::decl(&cfg),
            CapstanUninstall::decl(&cfg),
            CapstanExtensions::decl(&cfg),
            BridgeProvider::decl(&cfg),
            CapstanProviders::decl(&cfg),
            BridgeSearchItem::decl(&cfg),
            CapstanSearch::decl(&cfg),
            BridgeEpisode::decl(&cfg),
            BridgeMedia::decl(&cfg),
            CapstanLoad::decl(&cfg),
            BridgeLink::decl(&cfg),
            BridgeSubtitle::decl(&cfg),
            CapstanLinks::decl(&cfg),
            BridgeCatalogueRow::decl(&cfg),
            CapstanCatalogue::decl(&cfg),
            BridgeCatalogueSection::decl(&cfg),
            CapstanCataloguePage::decl(&cfg),
        ];
        crate::ipc_bindings::check("capstan-ipc.ts", "capstan/reply.rs", &decls);
    }

    #[test]
    fn malformed_fields_read_as_their_defaults() {
        let search: CapstanSearch = lenient::object(json!({
            "providerId": 7, "results": {"name": "x"}, "note": ["no"]
        }));
        assert!(
            search.provider_id.is_empty() && search.results.is_empty() && search.note.is_none()
        );
        let links: CapstanLinks = lenient::object(json!({
            "success": "yes", "links": [{"url": "u", "quality": "hd"}, 3], "subtitles": null
        }));
        assert!(!links.success && links.subtitles.is_empty());
        assert_eq!(links.links.len(), 1);
        assert_eq!(
            (links.links[0].url.as_str(), links.links[0].quality),
            ("u", 0)
        );
        let load: CapstanLoad = lenient::object(json!("not an object"));
        assert!(!load.found && load.result.is_none());
    }

    #[test]
    fn a_page_reads_sections_without_items_as_empty_and_a_string_has_next_as_false() {
        let page: CapstanCataloguePage = lenient::object(json!({
            "sections": [{"items": [{"name": "A", "url": "a"}]}, {}], "items": [{"name": "F"}], "hasNext": "true"
        }));
        let items: Vec<usize> = page.sections.iter().map(|s| s.items.len()).collect();
        assert_eq!((items, page.has_next), (vec![1, 0], false));
    }

    #[test]
    fn rows_stay_declared_unless_explicitly_false() {
        let page: CapstanCatalogue = lenient::object(json!({
            "rows": [{"name": "a"}, {"name": "b", "declared": false}, {"name": "c", "declared": "no"}]
        }));
        let declared: Vec<bool> = page.rows.iter().map(|r| r.declared).collect();
        assert_eq!(declared, [true, false, true]);
    }
}
