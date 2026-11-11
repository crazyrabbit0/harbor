import type {
  WowAddonManifest,
  WowAddon,
  WowAddonInventory,
} from "@/lib/generated/games-mod-managers-ipc";
export type { WowAddonManifest, WowAddon, WowAddonInventory };
export function wowAddonWebsite(addon: WowAddon): string | null {
  if (
    addon.manifest?.wowiId &&
    Number.isSafeInteger(addon.manifest.wowiId) &&
    addon.manifest.wowiId > 0
  )
    return `https://www.wowinterface.com/downloads/info${addon.manifest.wowiId}.html`;
  try {
    const url = new URL(addon.manifest?.website ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "www.curseforge.com",
        "curseforge.com",
        "www.wowinterface.com",
        "www.wowace.com",
        "addons.wago.io",
        "github.com",
        "www.tukui.org",
        "tukui.org",
      ].includes(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function wowAddonGameVersion(value: number): string {
  if (!Number.isSafeInteger(value) || value < 10_000 || value >= 1_000_000) return "";
  return `${Math.floor(value / 10_000)}.${Math.floor((value % 10_000) / 100)}.${value % 100}`;
}
export function filterWowAddons(addons: WowAddon[], query: string, attention: boolean): WowAddon[] {
  const needle = query.normalize("NFC").trim().toLocaleLowerCase();
  return addons.filter(
    (addon) =>
      (!attention || addon.state !== "ready" || addon.missingDependencies.length > 0) &&
      [addon.folder, addon.manifest?.title, addon.manifest?.author]
        .filter(Boolean)
        .some((value) => value!.normalize("NFC").toLocaleLowerCase().includes(needle)),
  );
}
