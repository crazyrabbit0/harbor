fn main() {
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if windows_msvc {
        // Test binaries get no Common-Controls v6 manifest, so comctl32 must load lazily or they cannot start.
        println!("cargo:rustc-link-arg=delayimp.lib");
        println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
        println!("cargo:rustc-link-arg=/STACK:16777216,1048576");
    }
    let windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
    if windows && std::env::var_os("CARGO_FEATURE_MPV").is_some() {
        // Dependents' test binaries link libmpv2 too, and only the app's build script knows src-tauri/libmpv.
        let libmpv = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../libmpv");
        println!("cargo:rerun-if-changed={}", libmpv.join("mpv.lib").display());
        if libmpv.join("mpv.lib").exists() {
            println!("cargo:rustc-link-search=native={}", libmpv.display());
        }
    }
}
