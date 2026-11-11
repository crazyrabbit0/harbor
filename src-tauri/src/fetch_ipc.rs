//! The `harbor_fetch` and `harbor_upload` request and response types exported to src/lib/generated/fetch-ipc.ts by the `export_bindings` test.

#[cfg(test)]
mod tests {
    use crate::http_fetch::HarborUploadArgs;
    use harbor_shared::fetch::{HarborFetchArgs, HarborFetchResponse};
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        crate::ipc_bindings::check(
            "fetch-ipc.ts",
            "fetch_ipc.rs",
            &[
                HarborFetchArgs::decl(&cfg),
                HarborFetchResponse::decl(&cfg),
                HarborUploadArgs::decl(&cfg),
            ],
        );
    }
}
