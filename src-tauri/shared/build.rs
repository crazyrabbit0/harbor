fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let windows_msvc =
        target_os == "windows" && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if windows_msvc {
        // Test binaries get no Common-Controls v6 manifest, so comctl32 must load lazily or they cannot start.
        println!("cargo:rustc-link-arg=delayimp.lib");
        println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
        println!("cargo:rustc-link-arg=/STACK:16777216,1048576");
    }
    if std::env::var_os("CARGO_FEATURE_MPV").is_none() {
        return;
    }
    // Dependents' test binaries link libmpv2 too, and only the app's build script adds these search paths.
    if target_os == "windows" {
        let libmpv = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../libmpv");
        println!(
            "cargo:rerun-if-changed={}",
            libmpv.join("mpv.lib").display()
        );
        if libmpv.join("mpv.lib").exists() {
            println!("cargo:rustc-link-search=native={}", libmpv.display());
        }
    }
    if target_os == "macos" {
        println!("cargo:rerun-if-env-changed=HOMEBREW_PREFIX");
        // Same Homebrew/MacPorts search as src-tauri/build.rs; keep the two lists in sync.
        let mut prefixes: Vec<String> = Vec::new();
        if let Ok(p) = std::env::var("HOMEBREW_PREFIX") {
            if !p.is_empty() {
                prefixes.push(p);
            }
        }
        for p in ["/opt/homebrew", "/usr/local", "/opt/local"] {
            prefixes.push(p.to_string());
        }
        for prefix in &prefixes {
            for sub in ["lib", "opt/mpv/lib", "opt/libmpv/lib"] {
                let dir = std::path::Path::new(prefix).join(sub);
                if dir.exists() {
                    println!("cargo:rustc-link-search=native={}", dir.display());
                }
            }
        }
    }
}
