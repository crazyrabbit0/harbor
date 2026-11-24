//! harbor-core's stream enums and pipeline structs, exported to src/lib/generated/streams-ipc.ts by `export_bindings`.

#[cfg(test)]
mod tests {
    use harbor_core::{
        AudioCodec, AudioInfo, Codec, Container, Contributor, DebridSlug, HdrFormat, ParsedStream,
        Resolution, ScoreReason, ScoredStream, Source, Stream, StreamSubtitle, Tier,
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
            AudioInfo::decl(&cfg),
            StreamSubtitle::decl(&cfg),
            Contributor::decl(&cfg),
            Stream::decl(&cfg),
            ParsedStream::decl(&cfg),
            ScoreReason::decl(&cfg),
            ScoredStream::decl(&cfg),
        ];
        crate::ipc_bindings::check("streams-ipc.ts", "streams_ipc.rs", &decls);
    }
}
