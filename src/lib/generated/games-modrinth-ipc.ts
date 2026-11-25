// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type ModrinthCategory = { project_type: string | null, name: string | null, };

export type ModrinthFile = { primary: boolean | null, size: number | null, filename: string | null, };

export type ModrinthGameVersion = { version: string | null, version_type: string | null, };

export type ModrinthLicense = { id: string | null, name: string | null, };

export type ModrinthProject = { id: string | null, project_id: string | null, project_type: string | null, slug: string | null, title: string | null, description: string | null, author: string | null, icon_url: string | null, featured_gallery: string | null, gallery: Array<unknown> | null, downloads: number | null, followers: number | null, follows: number | null, categories: Array<unknown> | null, display_categories: Array<unknown> | null, loaders: Array<unknown> | null, game_versions: Array<unknown> | null, versions: Array<unknown> | null, date_modified: string | null, updated: string | null, body: string | null, license: ModrinthLicense | null, source_url: string | null, issues_url: string | null, wiki_url: string | null, };

export type ModrinthRelease = { id: string | null, project_id: string | null, changelog?: string | null, };

export type ModrinthSearch = { hits: Array<ModrinthProject> | null, total_hits: number | null, };

export type ModrinthVersion = { id: string | null, name: string | null, version_number: string | null, version_type: string | null, date_published: string | null, game_versions: Array<unknown> | null, loaders: Array<unknown> | null, files: Array<ModrinthFile> | null, dependencies: Array<ModrinthVersionDependency> | null, };

export type ModrinthVersionDependency = { dependency_type: string | null, project_id: string | null, version_id: string | null, file_name: string | null, };

export type ModrinthReply = ModrinthSearch | ModrinthProject | ModrinthRelease | Array<ModrinthVersion> | Array<ModrinthCategory> | Array<ModrinthGameVersion>;
