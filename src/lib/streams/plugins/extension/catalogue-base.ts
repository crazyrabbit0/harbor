// Free of plugin runtime imports so home rows can recognise an extension catalogue without loading the plugin layer.
export const PLUGIN_ADDON_PREFIX = "harbor-plugin://";

/** The catalogue's identity as a url-shaped string, the field every browse surface persists and fetches by. */
export function extensionCatalogueBase(pluginId: string, providerId: string): string {
  return `${PLUGIN_ADDON_PREFIX}${pluginId}/${providerId}`;
}

export function parseExtensionCatalogueBase(
  base: string,
): { pluginId: string; providerId: string } | null {
  if (!base.startsWith(PLUGIN_ADDON_PREFIX)) return null;
  const rest = base.slice(PLUGIN_ADDON_PREFIX.length);
  const cut = rest.indexOf("/");
  if (cut <= 0) return null;
  const pluginId = rest.slice(0, cut);
  const providerId = rest.slice(cut + 1);
  return pluginId && providerId ? { pluginId, providerId } : null;
}

export function isExtensionCatalogueBase(base: string): boolean {
  return parseExtensionCatalogueBase(base) != null;
}
