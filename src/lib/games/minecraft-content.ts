import type { MinecraftContentState } from "@/lib/generated/games-minecraft-ipc";
export type { MinecraftContentState };

export type MinecraftModBinding = {
  id: string;
  name: string;
  libraryPath: string;
  gameVersion: string;
  loader: "fabric";
};
