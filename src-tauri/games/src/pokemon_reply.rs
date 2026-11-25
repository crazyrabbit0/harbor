//! The `games_pokemon` reply envelope; each operation fills some fields; an absent field stays absent.

use harbor_shared::lenient;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "PokemonHistoryEntry"))]
pub struct HistoryEntry {
    #[serde(deserialize_with = "lenient::value")]
    pub id: String,
    #[serde(deserialize_with = "lenient::value")]
    pub at: u64,
}

/// `saves`, `changes`, `bank` and `summary` relay save discovery's and the .NET engine's own JSON.
#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "PokemonBankReply"))]
pub struct Reply {
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub unreadable_entries: Option<u64>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub bank_truncated: Option<bool>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "Array<unknown>"))]
    pub saves: Option<Vec<Value>>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub ready: Option<bool>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub source_path: Option<String>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub draft_skipped: Option<bool>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "Array<unknown>"))]
    pub changes: Option<Vec<Value>>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub history: Option<Vec<HistoryEntry>>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "Array<unknown>"))]
    pub bank: Option<Vec<Value>>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub session: Option<String>,
    #[serde(
        deserialize_with = "lenient::value",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional))]
    pub backup: Option<String>,
    // The next five may arrive as null (a file name that is not UTF-8, a committed review), which the UI tells apart from absent.
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "string | null"))]
    pub name: Option<Option<String>>,
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "unknown"))]
    pub summary: Option<Option<Value>>,
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "string | null"))]
    pub review: Option<Option<String>>,
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "string | null"))]
    pub file_name: Option<Option<String>>,
    #[serde(
        deserialize_with = "lenient::present",
        skip_serializing_if = "Option::is_none"
    )]
    #[cfg_attr(test, ts(optional, type = "string | null"))]
    pub format: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn relay(value: Value) -> Value {
        serde_json::to_value(lenient::object::<Reply>(value)).unwrap()
    }

    #[test]
    fn absent_fields_stay_absent_and_null_review_stays_null() {
        assert_eq!(relay(json!({})), json!({}));
        assert_eq!(
            relay(json!({"summary": {"a": 1}, "review": null, "changes": []})),
            json!({"summary": {"a": 1}, "review": null, "changes": []})
        );
        assert_eq!(relay(json!({"review": "t"}))["review"], json!("t"));
    }

    #[test]
    fn engine_payloads_pass_through_unchanged() {
        let bank = json!({"bank": [{"id": "x", "info": {"species": 25}, "extra": true}], "unreadableEntries": 2, "bankTruncated": false});
        assert_eq!(relay(bank.clone()), bank);
        let history = json!({"history": [{"id": "b", "at": 5}]});
        assert_eq!(relay(history.clone()), history);
    }

    #[test]
    fn a_field_of_the_wrong_type_reads_as_absent() {
        assert_eq!(
            relay(json!({"ready": "yes", "review": 4, "name": null})),
            json!({"name": null})
        );
    }
}
