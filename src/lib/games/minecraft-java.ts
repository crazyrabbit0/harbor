import { minecraftRuntimeError } from "./minecraft-runtime";

import type {
  MinecraftJava,
  MinecraftJavaState,
  MinecraftJavaPlan,
} from "@/lib/generated/games-minecraft-ipc";
export type { MinecraftJava, MinecraftJavaState, MinecraftJavaPlan };

export type MinecraftJavaProgress = {
  profile: string;
  operationId: string;
  phase: "download" | "extract" | "verify";
  bytes: number;
  totalBytes: number;
};
export function minecraftJavaError(reason: unknown) {
  const errors: Record<string, string> = {
    java_version: "versionError",
    java_arch: "versionError",
    java_invalid: "invalidError",
    java_path: "invalidError",
    java_timeout: "invalidError",
    java_memory: "invalidError",
    java_metadata: "metadataError",
    java_unavailable: "metadataError",
    java_archive: "metadataError",
    java_game_files: "metadataError",
  };
  return errors[String(reason)]
    ? `games.minecraft.java.${errors[String(reason)]}`
    : minecraftRuntimeError(reason);
}
