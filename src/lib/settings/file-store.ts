import { invoke } from "@tauri-apps/api/core";
import { recordSettingsWrite } from "./write-status";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readSettingsFile(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return (await invoke<string | null>("settings_read")) ?? null;
  } catch (error) {
    console.error("[settings] settings_read failed", error);
    return null;
  }
}

export async function writeSettingsFile(content: string): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("settings_write", { content });
    recordSettingsWrite(true);
  } catch (error) {
    console.error(
      "[settings] settings_write failed; settings.json may differ from localStorage",
      error,
    );
    recordSettingsWrite(false, describeError(error));
  }
}
