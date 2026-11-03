//! Exports the streaming-server status type to src/lib/generated/cast-server-ipc.ts.

#[cfg(test)]
mod tests {
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let cfg = ts_rs::Config::default();
        crate::ipc_bindings::check(
            "cast-server-ipc.ts",
            "cast_server_ipc.rs",
            &[crate::cast_server::CastServerStatus::decl(&cfg)],
        );
    }
}
