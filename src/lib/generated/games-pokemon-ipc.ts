// Generated from src-tauri/games/src/ipc_decls.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type PokemonHistoryEntry = { id: string, at: number, };

export type PokemonBankReply = { unreadableEntries?: number, bankTruncated?: boolean, saves?: Array<unknown>, ready?: boolean, sourcePath?: string, draftSkipped?: boolean, changes?: Array<unknown>, history?: Array<PokemonHistoryEntry>, bank?: Array<unknown>, session?: string, backup?: string, name?: string | null, summary?: unknown, review?: string | null, fileName?: string | null, format?: string | null, };
