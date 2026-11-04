// Engine, addon and finished-download links, and debrid links sized by the provider, need no stub probe.
export function skipsPreflight(r: {
  via: string;
  readiness?: { exactUrlValidated: boolean } | null;
}): boolean {
  return (
    r.via === "p2p" ||
    r.via === "direct" ||
    r.via === "local-download" ||
    r.readiness?.exactUrlValidated === true
  );
}
