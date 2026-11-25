//! Typed Modrinth replies: the fields the catalog and mod readers use, each read leniently (a wrong JSON type reads as null).

use harbor_shared::lenient;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthLicense {
    #[serde(deserialize_with = "lenient::value")]
    pub id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub name: Option<String>,
}

/// A search hit or a project; search hits embed loaders in `categories` and call followers `follows`.
#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthProject {
    #[serde(deserialize_with = "lenient::value")]
    pub id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub project_id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub project_type: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub slug: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub title: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub description: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub author: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub icon_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub featured_gallery: Option<String>,
    // Search hits list image URLs, projects list image objects.
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub gallery: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    pub downloads: Option<f64>,
    #[serde(deserialize_with = "lenient::value")]
    pub followers: Option<f64>,
    #[serde(deserialize_with = "lenient::value")]
    pub follows: Option<f64>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub categories: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub display_categories: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub loaders: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub game_versions: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub versions: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    pub date_modified: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub updated: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub body: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub license: Option<ModrinthLicense>,
    #[serde(deserialize_with = "lenient::value")]
    pub source_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub issues_url: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub wiki_url: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthSearch {
    #[serde(deserialize_with = "lenient::objects")]
    pub hits: Option<Vec<ModrinthProject>>,
    #[serde(deserialize_with = "lenient::value")]
    pub total_hits: Option<f64>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthFile {
    #[serde(deserialize_with = "lenient::value")]
    pub primary: Option<bool>,
    #[serde(deserialize_with = "lenient::value")]
    pub size: Option<f64>,
    #[serde(deserialize_with = "lenient::value")]
    pub filename: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthVersionDependency {
    #[serde(deserialize_with = "lenient::value")]
    pub dependency_type: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub project_id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub version_id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub file_name: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthVersion {
    #[serde(deserialize_with = "lenient::value")]
    pub id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub name: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub version_number: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub version_type: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub date_published: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub game_versions: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::value")]
    #[cfg_attr(test, ts(type = "Array<unknown> | null"))]
    pub loaders: Option<Vec<Value>>,
    #[serde(deserialize_with = "lenient::objects")]
    pub files: Option<Vec<ModrinthFile>>,
    #[serde(deserialize_with = "lenient::objects")]
    pub dependencies: Option<Vec<ModrinthVersionDependency>>,
}

/// One release's notes; `changelog` is absent, null or text; the reader tells those apart.
#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthRelease {
    #[serde(deserialize_with = "lenient::value")]
    pub id: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub project_id: Option<String>,
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub changelog: Option<Option<String>>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthCategory {
    #[serde(deserialize_with = "lenient::value")]
    pub project_type: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub name: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct ModrinthGameVersion {
    #[serde(deserialize_with = "lenient::value")]
    pub version: Option<String>,
    #[serde(deserialize_with = "lenient::value")]
    pub version_type: Option<String>,
}

/// The reply of `games_modrinth` and `games_minecraft_catalog`, shaped by the request's `kind`.
#[derive(Serialize)]
#[serde(untagged)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub enum ModrinthReply {
    Search(ModrinthSearch),
    Project(ModrinthProject),
    Release(ModrinthRelease),
    Versions(Vec<ModrinthVersion>),
    Categories(Vec<ModrinthCategory>),
    Games(Vec<ModrinthGameVersion>),
}

fn object<T: serde::de::DeserializeOwned + Default>(value: Value) -> super::modrinth::Result<T> {
    // The readers reject a reply of the wrong JSON kind with this same code.
    value
        .is_object()
        .then(|| lenient::object(value))
        .ok_or("mods_metadata")
}

// Elements keep their positions (a malformed one reads as all-null), so the readers' slice limits cover the same rows.
fn array<T: serde::de::DeserializeOwned + Default>(
    value: Value,
) -> super::modrinth::Result<Vec<T>> {
    match value {
        Value::Array(items) => Ok(items.into_iter().map(lenient::object).collect()),
        _ => Err("mods_metadata"),
    }
}

pub fn read(kind: &str, value: Value) -> super::modrinth::Result<ModrinthReply> {
    Ok(match kind {
        "search" => ModrinthReply::Search(object(value)?),
        "project" => ModrinthReply::Project(object(value)?),
        "version" => ModrinthReply::Release(object(value)?),
        "versions" => ModrinthReply::Versions(array(value)?),
        "categories" => ModrinthReply::Categories(array(value)?),
        "games" => ModrinthReply::Games(array(value)?),
        _ => return Err("mods_request"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn wrong_field_types_read_as_null_and_changelog_keeps_null_apart_from_absent() {
        let reply = read(
            "search",
            json!({"hits": [{"project_id": 4, "title": "T", "gallery": ["a"]}], "total_hits": "9"}),
        )
        .unwrap();
        let out = serde_json::to_value(reply).unwrap();
        assert_eq!(out["hits"][0]["project_id"], Value::Null);
        assert_eq!(out["hits"][0]["gallery"], json!(["a"]));
        assert_eq!(out["total_hits"], Value::Null);
        let notes = |v| serde_json::to_value(read("version", v).unwrap()).unwrap();
        assert_eq!(notes(json!({"changelog": null}))["changelog"], Value::Null);
        assert!(notes(json!({"id": "x"})).get("changelog").is_none());
        assert!(notes(json!({"changelog": 3})).get("changelog").is_none());
    }

    #[test]
    fn a_reply_of_the_wrong_json_kind_is_rejected_as_the_readers_did() {
        assert_eq!(
            read("versions", json!({"error": "x"})).err(),
            Some("mods_metadata")
        );
        assert_eq!(read("project", json!([])).err(), Some("mods_metadata"));
        assert!(read("games", json!([{"version": "1.21"}, 5])).is_ok());
    }
}
