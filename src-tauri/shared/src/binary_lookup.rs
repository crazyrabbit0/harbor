use std::path::PathBuf;

/// Common locations for command-line media tools on a Linux desktop. The
/// caller should add app-bundled paths first, then use these candidates.
pub fn linux_binary_candidates(binary: &str) -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from(binary)];

    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(PathBuf::from(home).join(".local/bin").join(binary));
    }

    candidates.extend([
        PathBuf::from("/usr/local/bin").join(binary),
        PathBuf::from("/usr/bin").join(binary),
        PathBuf::from("/snap/bin").join(binary),
    ]);

    candidates
}
