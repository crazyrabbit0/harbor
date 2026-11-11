//! Collects ts-rs declarations for games IPC result types (with every named type they use) and exports the area files.

use std::any::TypeId;
use std::collections::HashSet;
use ts_rs::{TypeVisitor, TS};

/// Declarations of the added types and every named type they use, each once, in a stable order.
pub struct Decls {
    cfg: ts_rs::Config,
    seen: HashSet<TypeId>,
    names: HashSet<String>,
    out: Vec<String>,
}

impl Decls {
    // Every integer on these wires fits a JS number, so u64/usize fields are typed `number`, not `bigint`.
    pub fn new() -> Self {
        Self {
            cfg: ts_rs::Config::default().with_large_int("number"),
            seen: HashSet::new(),
            names: HashSet::new(),
            out: Vec::new(),
        }
    }

    /// Appends T's not-yet-emitted dependencies sorted by name (ts-rs visits them in hash order), then T.
    pub fn add<T: TS + 'static + ?Sized>(mut self) -> Self {
        let start = self.out.len();
        self.visit::<T>();
        if self.out.len() > start {
            let root = self.out.pop().unwrap();
            self.out[start..].sort();
            self.out.push(root);
        }
        self
    }

    pub fn finish(self) -> Vec<String> {
        self.out
    }
}

impl TypeVisitor for Decls {
    fn visit<T: TS + 'static + ?Sized>(&mut self) {
        if T::output_path().is_none() {
            T::visit_generics(self);
            return;
        }
        if !self.seen.insert(TypeId::of::<T>()) {
            return;
        }
        let name = T::ident(&self.cfg);
        assert!(
            self.names.insert(name.clone()),
            "two Rust types export as {name}; give one a ts(rename)"
        );
        T::visit_dependencies(self);
        self.out.push(T::decl(&self.cfg));
    }
}

#[cfg(test)]
mod tests {
    use super::Decls;
    use crate::{cloud_files, patch_download, patch_workspace};

    #[test]
    fn export_sources() {
        let decls = Decls::new()
            .add::<cloud_files::CloudPage>()
            .add::<cloud_files::CloudDownload>()
            .add::<cloud_files::WebPage>()
            .add::<cloud_files::PmPage>()
            .add::<cloud_files::HostCheck>()
            .add::<cloud_files::AdLink>()
            .add::<cloud_files::AdStatus>()
            .add::<patch_workspace::PatchPlan>()
            .add::<patch_workspace::PatchReceipt>()
            .add::<patch_download::DownloadReview>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-sources-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_library() {
        use crate::{
            custom_launch, embedded, emulation, game_shortcuts, minecraft_account, minecraft_data,
            minecraft_loader, saves, source_browser, steam_account, steam_shortcut_launch,
        };
        let decls = Decls::new()
            .add::<emulation::Emulator>()
            .add::<emulation::RomScan>()
            .add::<emulation::RunningGame>()
            .add::<embedded::RuntimeStatus>()
            .add::<embedded::Session>()
            .add::<custom_launch::LaunchConfig>()
            .add::<custom_launch::CustomProcess>()
            .add::<custom_launch::CustomExit>()
            .add::<game_shortcuts::Shortcuts>()
            .add::<steam_shortcut_launch::Process>()
            .add::<saves::SaveRestoreReceipt>()
            .add::<source_browser::BrowserFile>()
            .add::<steam_account::SteamAchievements>()
            .add::<minecraft_account::Challenge>()
            .add::<minecraft_data::Status>()
            .add::<minecraft_loader::Release>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-library-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_minecraft() {
        use crate::{
            minecraft_content, minecraft_instance_storage, minecraft_instances, minecraft_java,
            minecraft_launch_process, minecraft_pack_install, minecraft_pack_update,
            minecraft_runtime, mod_files, mods,
        };
        let decls = Decls::new()
            .add::<mod_files::Workspace>()
            .add::<mods::Plan>()
            .add::<minecraft_content::Content>()
            .add::<minecraft_instances::Library>()
            .add::<minecraft_pack_install::Plan>()
            .add::<minecraft_pack_update::State>()
            .add::<minecraft_java::State>()
            .add::<minecraft_java::Plan>()
            .add::<minecraft_launch_process::State>()
            .add::<minecraft_runtime::Plan>()
            .add::<minecraft_runtime::State>()
            .add::<minecraft_instance_storage::State>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-minecraft-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_launchers() {
        use crate::{
            achievement_protocol, launcher_scan, launcher_sessions, source_public_files,
            steam_achievements, steam_shortcut_commands, SteamScan,
        };
        let decls = Decls::new()
            .add::<SteamScan>()
            .add::<steam_shortcut_commands::Snapshot>()
            .add::<launcher_scan::Scan>()
            .add::<launcher_sessions::Snapshot>()
            .add::<steam_achievements::Review>()
            .add::<achievement_protocol::Applied>()
            .add::<source_public_files::PublicFiles>()
            .add::<source_public_files::PublicDownload>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-launchers-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_mod_managers() {
        use crate::{stardew, stardew_catalog, stardew_reviews, stardew_updates};
        use crate::{wow_addon_reviews, wow_addons};
        let decls = Decls::new()
            .add::<stardew::Inventory>()
            .add::<stardew_updates::Report>()
            .add::<stardew_reviews::Workspace>()
            .add::<stardew_reviews::Review>()
            .add::<stardew_catalog::Catalog>()
            .add::<wow_addons::Inventory>()
            .add::<wow_addon_reviews::Workspace>()
            .add::<wow_addon_reviews::Review>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-mod-managers-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_requests() {
        use crate::{
            cloud_files, download_preparation, hydra_import, minecraft_catalog, p2p,
            preparation_intake, saves, sims_catalog, sims_lot51, sims_mts, source_public_files,
            transfers, wow_addon_reviews,
        };
        let decls = Decls::new()
            .add::<hydra_import::Request>()
            .add::<minecraft_catalog::Request>()
            .add::<source_public_files::Request>()
            .add::<source_public_files::batch::Request>()
            .add::<sims_mts::Request>()
            .add::<sims_lot51::Request>()
            .add::<sims_catalog::Request>()
            .add::<saves::SaveRequest>()
            .add::<wow_addon_reviews::Request>()
            .add::<cloud_files::Request>()
            .add::<cloud_files::LinkRequest>()
            .add::<cloud_files::AdPrepare>()
            .add::<cloud_files::AdRequest>()
            .add::<p2p::StartTorrent>()
            .add::<preparation_intake::Draft>()
            .add::<download_preparation::Configure>()
            .add::<transfers::NewTransfer>()
            .add::<transfers::NewBatch>()
            .add::<transfers::Relink>()
            .finish();
        harbor_shared::ipc_bindings::check(
            "games-requests-ipc.ts",
            "games/src/ipc_decls.rs",
            &decls,
        );
    }

    #[test]
    fn export_sims() {
        use crate::{sims_catalog, sims_cc, sims_dependencies, sims_duplicates, sims_files};
        use crate::{sims_lot51, sims_mts, sims_mts_browse, sims_packs, sims_reviews, sims_store};
        let decls = Decls::new()
            .add::<sims_files::Folder>()
            .add::<sims_reviews::Workspace>()
            .add::<sims_reviews::Review>()
            .add::<sims_store::sets::ModSet>()
            .add::<sims_store::metadata::Report>()
            .add::<sims_dependencies::Report>()
            .add::<sims_duplicates::Report>()
            .add::<sims_cc::Report>()
            .add::<sims_packs::Report>()
            .add::<sims_catalog::Catalog>()
            .add::<sims_lot51::Catalog>()
            .add::<sims_lot51::Detail>()
            .add::<sims_mts::Detail>()
            .add::<sims_mts_browse::Page>()
            .finish();
        harbor_shared::ipc_bindings::check("games-sims-ipc.ts", "games/src/ipc_decls.rs", &decls);
    }
}
