//! Cast command types exported to src/lib/generated/cast-ipc.ts by the `export_bindings` test.

#[cfg(test)]
mod tests {
    use harbor_shared::cast_types::{CastSub, CastSubStyle, TranscodeProfile};
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        let decls = [
            r#"export type CastKind = "chromecast" | "dlna" | "roku" | "airplay";"#.to_string(),
            crate::cast::CastDeviceInfo::decl(&cfg),
            crate::cast::CastStatus::decl(&cfg),
            crate::cast::CastLoadArgs::decl(&cfg),
            CastSub::decl(&cfg),
            CastSubStyle::decl(&cfg),
            TranscodeProfile::decl(&cfg),
        ];
        harbor_shared::ipc_bindings::check("cast-ipc.ts", "cast/src/cast_ipc.rs", &decls);
    }
}
