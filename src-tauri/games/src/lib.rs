#[cfg(test)]
mod test_lock;
#[cfg(test)]
mod ipc_decls;
mod pokemon_bank;
mod pokemon_save_discovery;
mod retro_save_path;
mod pokemon_workspace;
mod pokemon_files;
mod save_activity;
mod emulation;
mod embedded;
mod custom_launch;
mod hydra_import;
pub use hydra_import::try_run_worker as try_run_hydra_import_worker;
mod game_shortcuts;
mod native_package;
mod patch;
mod patch_workspace;
mod patch_download;
mod steam_paths;
mod steam_account;
mod steam_account_store;
mod minecraft_data;
mod minecraft_store;
mod minecraft_account;
mod minecraft_catalog;
mod minecraft_instances;
mod minecraft_loader;
mod minecraft_pack_state;
mod minecraft_pack_transaction;
mod minecraft_pack_update;
mod minecraft_lifecycle_files;
mod minecraft_recycle;
mod minecraft_instance_export;
mod minecraft_instance_storage;
mod minecraft_content;
mod minecraft_pack;
mod minecraft_pack_install;
mod minecraft_runtime_data;
mod minecraft_runtime;
mod minecraft_forge;
mod minecraft_forge_data;
mod minecraft_forge_process;
mod minecraft_forge_profile;
#[cfg(test)]
mod minecraft_forge_failure_tests;
mod minecraft_java_data;
mod minecraft_java_archive;
mod minecraft_java;
mod minecraft_launch_data;
mod minecraft_launch_process;
mod minecraft_launch;
#[cfg(test)]
mod minecraft_launch_tests;
#[cfg(test)]
mod minecraft_runtime_tests;

#[cfg(test)]
mod minecraft_instance_tests;

fn minecraft_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|_| "minecraft_store")?.join("game-accounts").join("minecraft"))
}
mod achievement_protocol;
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
mod achievement_schema;
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
mod steam_achievement_client;
mod steam_achievements;
pub use steam_achievements::try_run_worker as try_run_achievement_worker;
mod steam_scan;
mod steam_shortcuts;
mod steam_shortcut_art;
mod steam_shortcut_icons;
mod steam_shortcut_launch;
pub mod steam_shortcut_commands;
mod launcher_scan;
pub mod library_management;
mod wow_addons;
mod sims_package;
mod sims_manifest;
mod sims_files;
mod sims_packs;
mod sims_launch_settings;
mod sims_duplicates;
mod sims_fingerprints;
mod sims_dependencies;
mod sims_cc;
mod sims_store;
mod sims_catalog;
mod sims_lot51;
mod sims_mts;
mod sims_mts_browse;
mod stardew;
pub mod stardew_commands;
mod stardew_manifest;
mod stardew_guard;
mod stardew_install_files;
mod stardew_package;
mod stardew_store;
mod stardew_reviews;
mod stardew_progress;
mod stardew_updates;
mod stardew_remote;
mod stardew_catalog;
mod stardew_creator;
mod sims_reviews;
mod sims_saves;
mod save_restore;
mod wow_addon_package;
mod wow_addon_store;
mod wow_addon_guard;
mod wow_addon_reviews;
mod transfer_files;
mod transfer_protocol;
mod transfer_retry;
mod transfer_storage;
mod download_queue;
mod download_locations;
mod transfer_bandwidth;
mod download_metadata;
mod write_metrics;
mod p2p_storage;
mod p2p_space;
mod transfers;
mod save_files;
mod saves;
mod archives;
pub use archives::try_run_worker as try_run_archive_worker;
mod archive_jobs;
mod archive_cleanup;
mod archive_cleanup_io;
mod archive_cleanup_plans;
mod archive_cleanup_store;
mod game_file_use;
mod download_preparation;
mod preparation_runtime;
mod preparation_intake;
pub fn initialize_download_preparation(app:&tauri::AppHandle){preparation_runtime::initialize(app);}
mod setup;

mod p2p;
mod p2p_files;
mod modrinth;
mod mod_files;
mod mods;
mod fabric_mods;
mod cloud_files;
mod source_public_files;
mod source_browser;
mod source_browser_policy;
mod source_browser_grants;
mod source_verification;
mod source_verification_policy;
mod source_http;
mod source_http_requests;

use serde::Serialize;








mod launcher_sessions;





fn account_root(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{use tauri::Manager;Ok(app.path().app_data_dir().map_err(|_|"steam_account_store")?.join("game-accounts"))}
mod battlenet_account;
mod battlenet_account_policy;
mod battlenet_account_browser;






#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "SteamInstall"))]
pub struct SteamGame {
    app_id: u32,
    name: String,
    install_path: String,
    library_path: String,
    size_bytes: u64,
    last_played: u64,
    #[cfg_attr(test, ts(type = r#""installed" | "updating" | "missing""#))]
    state: &'static str,
    #[cfg_attr(test, ts(type = r#""none" | "queued" | "downloading" | "paused" | "validating" | "repair" | "uninstalling""#))]
    update: &'static str,
    bytes_to_download: u64,
    bytes_downloaded: u64,
    artwork: SteamArtwork,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct SteamArtwork {
    capsule: Option<String>,
    portrait: Option<String>,
    library_hero: Option<String>,
    logo: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct SteamLibrary {
    path: String,
    available: bool,
    app_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "SteamLibraryScan"))]
pub struct SteamScan {
    steam_found: bool,
    libraries: Vec<SteamLibrary>,
    games: Vec<SteamGame>,
    warnings: Vec<&'static str>,
}

fn scan() -> steam_scan::Scan {
    steam_paths::find_root()
        .map(|root| steam_scan::scan(&root))
        .unwrap_or_default()
}

mod commands;
pub use commands::*;

/// The invoke handler for every Games command; the app routes `games_*` commands here.
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        games_pokemon,
        games_scan_steam,
        steam_shortcut_commands::games_scan_steam_shortcuts,
        steam_shortcut_commands::games_launch_steam_shortcut,
        steam_shortcut_commands::games_steam_shortcut_icons,
        steam_shortcut_commands::games_launch_steam_shortcut_direct,
        steam_shortcut_commands::games_steam_shortcut_running,
        games_scan_launchers,
        games_wow_addons,
        games_sims_folders,
        games_sims_workspace,
        games_sims_inspect,
        games_sims_metadata,
        games_sims_packs,
        games_sims_duplicates,
        games_sims_dependencies,
        games_sims_tray_preview,
        games_sims_tray_content,
        games_sims_kept_folder,
        games_sims_catalog,
        games_sims_lot51_catalog,
        stardew_commands::games_stardew_folders,
        stardew_commands::games_stardew_inspect,
        stardew_commands::games_stardew_updates,
        stardew_commands::games_stardew_cancel,
        stardew_commands::games_stardew_workspace,
        stardew_commands::games_stardew_review,
        stardew_commands::games_stardew_apply,
        stardew_commands::games_stardew_recover,
        stardew_commands::games_stardew_discard,
        stardew_commands::games_stardew_catalog,
        stardew_commands::games_stardew_creator_review,
        games_sims_mts_detail,
        games_sims_mts_browse,
        games_sims_mts_review,
        games_sims_lot51_detail,
        games_sims_lot51_review,
        games_sims_creator_review,
        games_sims_review,
        games_sims_apply,
        games_sims_cancel,
        games_sims_sets,
        games_sims_set_save,
        games_sims_set_remove,
        games_sims_discard,
        games_sims_recover,
        games_sims_save_context,
        games_sims_save_recover,
        games_save_recovery_status,
        games_recover_save_restore,
        games_sims_save_list,
        games_sims_save_snapshot,
        games_sims_save_review,
        games_wow_addon_package,
        games_wow_addon_workspace,
        games_wow_addon_review,
        games_wow_addon_apply,
        games_wow_addon_discard,
        games_wow_addon_cancel,
        games_wow_addon_recover,
        games_launch_launcher_game,
        games_launcher_sessions,
        games_inspect_archive,
        games_inspect_setup,
        games_setup_icon,
        games_start_setup,
        games_setup_jobs,
        games_recover_setup,
        games_reveal_setup,
        games_observe_setup,
        games_archive_space,
        games_extract_archive,
        games_cancel_archive,
        games_discard_archive,
        games_archive_jobs,
        games_review_archive_cleanup,
        games_discard_archive_cleanup,
        games_recycle_archive_sources,
        games_archive_cleanup_records,
        games_archive_cleanup_action,
        games_start_archive,
        games_prepare_archive,
        games_preparation_choices,
        games_preparation_version,
        games_preparation_candidates,
        games_set_preparation,
        games_disable_preparation,
        games_remove_archive_job,
        games_steam_account_status,
        games_battlenet_account,
        games_battlenet_import,
        games_battlenet_cancel,
        games_battlenet_preferences,
        games_battlenet_disconnect,
        games_minecraft_status,
        games_minecraft_begin,
        games_minecraft_poll,
        games_minecraft_cancel,
        games_minecraft_refresh,
        games_minecraft_disconnect,
        games_minecraft_apply_skin,
        games_minecraft_apply_cape,
        games_minecraft_texture,
        games_minecraft_catalog,
        games_minecraft_instances,
        games_minecraft_instance_create,
        games_minecraft_instance_rename,
        games_minecraft_instance_folder,
        games_minecraft_content,
        games_minecraft_fabric_versions,
        games_minecraft_loader_versions,
        games_minecraft_pack_update_state,
        games_minecraft_pack_update_review,
        games_minecraft_pack_update_select,
        games_minecraft_pack_update_apply,
        games_minecraft_pack_update_discard,
        games_minecraft_pack_update_cancel,
        games_minecraft_instance_export_review,
        games_minecraft_instance_export_apply,
        games_minecraft_instance_storage,
        games_minecraft_instance_remove_review,
        games_minecraft_instance_remove_apply,
        games_minecraft_lifecycle_discard,
        games_minecraft_pack_review,
        games_minecraft_pack_install,
        games_minecraft_pack_cancel,
        games_minecraft_pack_discard,
        games_minecraft_runtime_state,
        games_minecraft_runtime_review,
        games_minecraft_runtime_install,
        games_minecraft_runtime_cancel,
        games_minecraft_runtime_discard,
        games_minecraft_java_state,
        games_minecraft_java_review,
        games_minecraft_java_select,
        games_minecraft_java_memory,
        games_minecraft_java_install,
        games_minecraft_java_discard,
        games_minecraft_launch_state,
        games_minecraft_launch,
        games_connect_steam_account,
        games_refresh_steam_account,
        games_disconnect_steam_account,
        games_steam_achievements,
        games_read_local_achievements,
        games_apply_local_achievements,
        games_discard_local_achievements,
        games_install_steam,
        games_list_transfers,
        games_transfer_settings,
        games_transfer_storage,
        games_download_locations,
        games_set_transfer_bandwidth,
        games_source_public_review,
        games_source_public_prepare,
        games_source_public_prepare_batch,
        games_source_public_cancel_batch,
        games_hydra_import_review,
        games_hydra_import_cancel,
        games_cloud_list,
        games_cloud_download,
        games_cloud_resolve_link,
        games_cloud_host_check,
        games_cloud_ad_prepare,
        games_cloud_ad_status,
        games_cloud_web_create,
        games_cloud_web_list,
        games_cloud_web_status,
        games_cloud_web_download,
        games_cloud_web_find,
        games_cloud_pm_create,
        games_cloud_pm_list,
        games_cloud_pm_status,
        games_cloud_pm_download,
        games_cloud_pm_retry,
        games_modrinth,
        games_mod_workspace,
        games_review_mods,
        games_install_mods,
        games_mod_action,
        games_cancel_mods,
        games_discard_mods,
        games_list_torrents,
        games_inspect_torrent,
        games_cancel_torrent_inspection,
        games_discard_torrent,
        games_start_torrent,
        games_torrent_action,
        games_seed_torrent,
        games_list_save_snapshots,
        games_validate_custom_launch,
        games_game_shortcuts,
        games_allow_game_execution,
        games_custom_running,
        games_custom_history,
        games_validate_custom_artwork,
        games_launch_custom,
        games_create_save_snapshot,
        games_prepare_save_restore,
        games_restore_save_snapshot,
        games_cancel_save_operation,
        games_discard_save_restore,
        games_source_browser_choose,
        games_source_browser_close,
        games_source_verify,
        games_source_verify_cancel,
        games_source_verified_fetch,
        games_source_http_fetch,
        games_source_http_cancel,
        games_add_transfer,
        games_add_transfer_batch,
        games_transfer_action,
        games_relink_transfer,
        games_download_patch,
        games_cancel_patch_download,
        games_match_patch_sources,
        games_prepare_patch,
        games_write_patch,
        games_discard_patch,
        games_scan_roms,
        games_find_emulators,
        games_validate_emulator,
        games_emulation_running,
        games_launch_emulated,
        games_retro_status,
        games_retro_start,
        games_retro_close,
        games_launch_steam,
        library_management::games_manage_steam,
        library_management::games_manage_launcher,
        library_management::games_open_installed_apps,
    ]
}
