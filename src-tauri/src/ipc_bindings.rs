//! The app's `*_ipc` modules hand their declarations to the shared writer, naming their file under src-tauri/src/.

pub(crate) fn check(file: &str, source: &str, decls: &[String]) {
    harbor_shared::ipc_bindings::check(file, &format!("src/{source}"), decls);
}
