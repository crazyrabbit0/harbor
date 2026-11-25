// Generated from src-tauri/src/capstan/reply.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type CapstanPing = { pong: boolean, protocol: number, extensions: number, providers: number, };

export type CapstanUnavailable = { method: string, descriptor: string, reason: string, };

export type CapstanExtension = { id: string, name: string, version: number, entryClass: string, file: string, source: string, providers: Array<string>, extractors: Array<string>, unavailable: Array<CapstanUnavailable>, };

export type CapstanUninstall = { id: string, fileRemoved: boolean, };

export type CapstanExtensions = { extensions: Array<CapstanExtension>, };

export type BridgeProvider = { id: string, extensionId: string, name: string, lang: string, mainUrl: string, types: Array<string>, hasQuickSearch: boolean, };

export type CapstanProviders = { providers: Array<BridgeProvider>, };

export type BridgeSearchItem = { name: string, url: string, type: string | null, posterUrl: string | null, quality: string | null, };

export type CapstanSearch = { providerId: string, page: number, results: Array<BridgeSearchItem>, note: string | null, };

export type BridgeEpisode = { data: string, name: string | null, season: number | null, episode: number | null, posterUrl: string | null, description: string | null, runtimeMinutes: number | null, airDate: number | null, track: string, };

export type BridgeMedia = { name: string, url: string, type: string, posterUrl: string | null, backgroundPosterUrl: string | null, year: number | null, plot: string | null, tags: Array<string>, durationMinutes: number | null, contentRating: string | null, score: number | null, comingSoon: boolean, playableData: string | null, episodes: Array<BridgeEpisode>, recommendations: Array<BridgeSearchItem>, actors: Array<string>, trailerUrls: Array<string>, syncIds: { [key in string]: string }, };

export type CapstanLoad = { providerId: string, found: boolean, result: BridgeMedia | null, note: string | null, };

export type BridgeLink = { source: string, name: string, url: string, referer: string, quality: number, type: string, headers: { [key in string]: string }, };

export type BridgeSubtitle = { lang: string, url: string, };

export type CapstanLinks = { providerId: string, success: boolean, links: Array<BridgeLink>, subtitles: Array<BridgeSubtitle>, note: string | null, };

export type BridgeCatalogueRow = { name: string, horizontalImages: boolean, declared: boolean, };

export type CapstanCatalogue = { providerId: string, hasMainPage: boolean, rows: Array<BridgeCatalogueRow>, };

export type BridgeCatalogueSection = { name: string, horizontalImages: boolean, items: Array<BridgeSearchItem>, };

export type CapstanCataloguePage = { providerId: string, row: string, page: number, hasNext: boolean, sections: Array<BridgeCatalogueSection>, note: string | null, };
