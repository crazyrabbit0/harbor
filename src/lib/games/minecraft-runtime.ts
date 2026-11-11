import { minecraftInstanceError } from "./minecraft-instances";

import type {
  MinecraftRuntimePlan,
  MinecraftRuntimeState,
} from "@/lib/generated/games-minecraft-ipc";
export type { MinecraftRuntimePlan, MinecraftRuntimeState };

export type MinecraftRuntimeProgress = {
  profile: string;
  operationId: string;
  phase: "files" | "processors";
  name: string;
  files: number;
  totalFiles: number;
  bytes: number;
  totalBytes: number;
};
export function minecraftRuntimeError(reason: unknown) {
  const key: Record<string, string> = {
    runtime_metadata: "metadataError",
    runtime_rules: "metadataError",
    runtime_legacy: "legacyError",
    runtime_loader: "loaderError",
    runtime_platform: "platformError",
    runtime_version: "versionError",
    runtime_limit: "metadataError",
    runtime_processor: "processorError",
    runtime_processor_timeout: "processorError",
    java_invalid: "javaRequired",
    java_version: "javaRequired",
    java_arch: "javaRequired",
    java_timeout: "javaRequired",
  };
  return key[String(reason)]
    ? `games.minecraft.runtime.${key[String(reason)]}`
    : minecraftInstanceError(reason);
}
