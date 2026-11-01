//! The `harbor_fetch` request/response shapes, and a hook so other crates can call the main crate's fetch.
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchArgs {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub body_base64: Option<String>,
    pub timeout_ms: Option<u64>,
    pub response_type: Option<String>,
    pub max_response_bytes: Option<u64>,
    pub credential_handle: Option<String>,
    pub public_network_only: Option<bool>,
    pub allow_local_network: Option<bool>,
    pub follow_redirects: Option<bool>,
    pub thumb_width_px: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
    pub headers: HashMap<String, String>,
    pub url: Option<String>,
}

pub type FetchFuture = Pin<Box<dyn Future<Output = Result<HarborFetchResponse, String>> + Send>>;

/// Managed state holding the main crate's `harbor_fetch`, so crates that cannot depend on it still use its guards.
#[derive(Clone)]
pub struct FetchHook(
    pub Arc<dyn Fn(tauri::AppHandle, HarborFetchArgs) -> FetchFuture + Send + Sync>,
);
