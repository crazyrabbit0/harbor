use super::*;

struct TempTree(PathBuf);

impl TempTree {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("harbor-fs-scope-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).expect("create temp tree");
        std::fs::write(dir.join("cover.png"), b"png").expect("write temp file");
        Self(dir)
    }
}

impl Drop for TempTree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn canonical(path: &Path) -> PathBuf {
    dunce::canonicalize(path).expect("canonicalize")
}

#[test]
fn settings_folders_returns_non_empty_folder_keys() {
    let json = r#"{
        "downloadDir": "D:\\Movies",
        "ebookDownloadDir": "",
        "screenshotDir": "  ",
        "gifDir": 5,
        "clipDir": "E:\\Clips",
        "playbackCacheDir": "F:\\cache",
        "streamCacheDir": null,
        "tmdbKey": "C:\\not-a-folder-key",
        "nested": { "downloadDir": "G:\\ignored" }
    }"#;
    assert_eq!(settings_folders(json), vec!["D:\\Movies", "E:\\Clips", "F:\\cache"]);
}

#[test]
fn settings_media_files_returns_screensaver_paths() {
    let json = r#"{"screensaverMedia":[{"id":"a","path":"D:\\Clips\\a.mp4"},{"id":"b","path":""},{"id":"c"}]}"#;
    assert_eq!(settings_media_files(json), vec!["D:\\Clips\\a.mp4"]);
    assert!(settings_media_files(r#"{"screensaverMedia":"x"}"#).is_empty());
}

#[test]
fn classify_rejects_dot_folders_and_app_state_below_home() {
    let tree = TempTree::new("sensitive");
    std::fs::create_dir_all(tree.0.join(".ssh")).unwrap();
    std::fs::create_dir_all(tree.0.join("AppData").join("Roaming")).unwrap();
    let home = canonical(&tree.0);
    let ssh = tree.0.join(".ssh");
    let roaming = tree.0.join("AppData").join("Roaming");
    assert_eq!(classify(ssh.to_str().unwrap(), Some(&home)), Err(Rejection::Sensitive));
    assert_eq!(classify(roaming.to_str().unwrap(), Some(&home)), Err(Rejection::Sensitive));
}

#[test]
fn settings_folders_ignores_invalid_json() {
    assert!(settings_folders("{not json").is_empty());
    assert!(settings_folders("[]").is_empty());
}

#[test]
fn classify_rejects_relative_paths() {
    assert_eq!(classify("relative/folder", None), Err(Rejection::Relative));
    assert_eq!(classify("..", None), Err(Rejection::Relative));
    assert_eq!(classify("", None), Err(Rejection::Relative));
}

#[test]
fn classify_rejects_missing_paths() {
    let tree = TempTree::new("missing");
    let missing = tree.0.join("does-not-exist");
    assert_eq!(classify(missing.to_str().unwrap(), None), Err(Rejection::Missing));
}

#[test]
fn classify_rejects_filesystem_roots() {
    #[cfg(windows)]
    {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        assert_eq!(classify(&format!("{drive}\\"), None), Err(Rejection::Root));
        assert_eq!(classify(&format!("{drive}/"), None), Err(Rejection::Root));
    }
    #[cfg(unix)]
    assert_eq!(classify("/", None), Err(Rejection::Root));
}

#[test]
fn classify_rejects_home_and_its_ancestors() {
    let tree = TempTree::new("home");
    let home = canonical(&tree.0.join("sub"));
    assert_eq!(classify(home.to_str().unwrap(), Some(&home)), Err(Rejection::HomeOrAncestor));
    assert_eq!(classify(tree.0.to_str().unwrap(), Some(&home)), Err(Rejection::HomeOrAncestor));
}

#[test]
fn classify_rejects_a_dot_dot_path_that_resolves_to_home() {
    let tree = TempTree::new("dotdot");
    let home = canonical(&tree.0);
    let sneaky = tree.0.join("sub").join("..");
    assert_eq!(classify(sneaky.to_str().unwrap(), Some(&home)), Err(Rejection::HomeOrAncestor));
}

#[test]
fn classify_allows_an_existing_directory_below_home() {
    let tree = TempTree::new("dir");
    let home = canonical(&tree.0);
    let sub = tree.0.join("sub");
    assert_eq!(classify(sub.to_str().unwrap(), Some(&home)), Ok(Grant::Directory(canonical(&sub))));
}

#[test]
fn asset_directory_accepts_an_existing_directory() {
    let tree = TempTree::new("asset-dir");
    let home = canonical(&tree.0);
    let sub = tree.0.join("sub");
    assert_eq!(asset_directory(sub.to_str().unwrap(), Some(&home)), Ok(canonical(&sub)));
}

#[test]
fn asset_directory_rejects_relative_missing_and_root_paths() {
    let tree = TempTree::new("asset-bad");
    let missing = tree.0.join("does-not-exist");
    assert_eq!(asset_directory("music/folder", None), Err(Rejection::Relative));
    assert_eq!(asset_directory(missing.to_str().unwrap(), None), Err(Rejection::Missing));
    #[cfg(windows)]
    {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        assert_eq!(asset_directory(&format!("{drive}\\"), None), Err(Rejection::Root));
    }
    #[cfg(unix)]
    assert_eq!(asset_directory("/", None), Err(Rejection::Root));
}

#[test]
fn asset_directory_rejects_home_ancestors_and_sensitive_folders() {
    let tree = TempTree::new("asset-sensitive");
    std::fs::create_dir_all(tree.0.join(".ssh")).unwrap();
    let home = canonical(&tree.0.join("sub"));
    let ssh = tree.0.join(".ssh");
    assert_eq!(asset_directory(home.to_str().unwrap(), Some(&home)), Err(Rejection::HomeOrAncestor));
    assert_eq!(asset_directory(tree.0.to_str().unwrap(), Some(&home)), Err(Rejection::HomeOrAncestor));
    assert_eq!(asset_directory(ssh.to_str().unwrap(), Some(&canonical(&tree.0))), Err(Rejection::Sensitive));
}

#[test]
fn asset_directory_rejects_a_file() {
    let tree = TempTree::new("asset-file");
    let file = tree.0.join("cover.png");
    assert_eq!(asset_directory(file.to_str().unwrap(), None), Err(Rejection::NotDirectory));
}

#[test]
fn classify_allows_an_existing_file_as_a_file() {
    let tree = TempTree::new("file");
    let file = tree.0.join("cover.png");
    assert_eq!(classify(file.to_str().unwrap(), None), Ok(Grant::File(canonical(&file))));
}
