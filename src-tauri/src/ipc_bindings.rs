//! Writes and stale-checks the ts-rs files in src/lib/generated/; each `*_ipc` module's `export_bindings` test calls `check`.

use std::path::PathBuf;

/// Compares `src/lib/generated/<file>` with the declarations, or rewrites it when HARBOR_WRITE_BINDINGS is set.
pub(crate) fn check(file: &str, source: &str, decls: &[String]) {
    let body: Vec<String> = decls
        .iter()
        .map(|d| format!("export {}", strip_doc_comments(d)))
        .collect();
    let expected = format!(
        "// Generated from src-tauri/src/{source}; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings\n\n{}\n",
        body.join("\n\n")
    );
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../src/lib/generated")
        .join(file);
    if std::env::var_os("HARBOR_WRITE_BINDINGS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &expected).unwrap();
        return;
    }
    let current = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    assert_eq!(
        current, expected,
        "src/lib/generated/{file} is stale; rerun its export_bindings test with HARBOR_WRITE_BINDINGS=1"
    );
}

// ts-rs copies Rust doc comments into JSDoc blocks; the TS side keeps its own notes.
fn strip_doc_comments(decl: &str) -> String {
    let mut out = String::new();
    let mut rest = decl;
    while let Some(start) = rest.find("/**") {
        out.push_str(&rest[..start]);
        let end = rest[start..]
            .find("*/")
            .map(|e| start + e + 2)
            .unwrap_or(rest.len());
        rest = rest[end..].trim_start_matches(['\n', ' ']);
    }
    out.push_str(rest);
    out.replace(", \n", ", ")
}
