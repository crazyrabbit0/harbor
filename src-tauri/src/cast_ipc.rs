//! Cast command types exported to src/lib/generated/cast-ipc.ts by the `export_bindings` test.

#[cfg(test)]
mod tests {
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        let decls = [
            r#"export type CastKind = "chromecast" | "dlna" | "roku" | "airplay";"#.to_string(),
            crate::cast::CastDeviceInfo::decl(&cfg),
            crate::cast::CastStatus::decl(&cfg),
            crate::cast_server::CastServerStatus::decl(&cfg),
            crate::cast_subs::CastSub::decl(&cfg),
            crate::cast_subs::CastSubStyle::decl(&cfg),
            crate::transcode::TranscodeProfile::decl(&cfg),
        ];
        crate::ipc_bindings::check("cast-ipc.ts", "cast_ipc.rs", &decls);
    }
}
