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
        if let Some(root) = self.out.pop() {
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
}
