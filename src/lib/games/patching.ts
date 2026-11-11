import type { PatchPlan, PatchReceipt } from "@/lib/generated/games-sources-ipc";
export type { PatchPlan, PatchReceipt };
export const GAME_FILE_EXTENSIONS = [
  "gba",
  "gb",
  "gbc",
  "nes",
  "sfc",
  "smc",
  "n64",
  "z64",
  "v64",
  "nds",
  "gen",
  "md",
  "smd",
  "sms",
  "gg",
  "pce",
  "bin",
  "iso",
  "rom",
];
export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}
export function patchErrorKey(error: unknown) {
  const code = String(error);
  if (["patch_source_mismatch", "patch_checksum_mismatch", "patch_target_mismatch"].includes(code))
    return `games.patch.${code}`;
  if (
    [
      "patch_expired",
      "patch_inputs_changed",
      "patch_output_exists",
      "patch_read_failed",
      "patch_write_failed",
      "patch_too_large",
      "patch_busy",
      "patch_game_type",
      "patch_output_type",
      "patch_unsupported",
    ].includes(code)
  )
    return `games.patch.${code}`;
  return "games.patch.invalid";
}
