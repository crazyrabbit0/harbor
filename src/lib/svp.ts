import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/lib/settings/types";

export type SvpStatus = {
  supported: boolean;
  reason?: string | null;
  installed: boolean;
  ready: boolean;
  loadable?: boolean | null;
  load_error?: string | null;
};

export async function svpStatus(): Promise<SvpStatus> {
  return invoke<SvpStatus>("svp_status");
}

export async function svpLaunch(): Promise<void> {
  await invoke("svp_launch");
}

export async function svpEnsureRunning(): Promise<boolean> {
  return invoke<boolean>("svp_ensure_running");
}

export async function svpApply({ svpTargetFps }: Pick<Settings, "svpTargetFps">): Promise<string> {
  return invoke<string>("svp_apply", { targetFps: svpTargetFps });
}
