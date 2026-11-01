//! harbor-core's stream enums exported to src/lib/generated/streams-ipc.ts by the `export_bindings` test.

#[cfg(test)]
mod tests {
    use harbor_core::{
        AudioCodec, Codec, Container, DebridSlug, HdrFormat, Resolution, Source, Tier,
    };
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        let decls = [
            Resolution::decl(&cfg),
            HdrFormat::decl(&cfg),
            Codec::decl(&cfg),
            AudioCodec::decl(&cfg),
            Source::decl(&cfg),
            Tier::decl(&cfg),
            DebridSlug::decl(&cfg),
            Container::decl(&cfg),
        ];
        crate::ipc_bindings::check("streams-ipc.ts", "streams_ipc.rs", &decls);
    }
}
