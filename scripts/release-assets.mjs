#!/usr/bin/env node
// `node scripts/release-assets.mjs <version> <asset-name>...` prints the markdown download table for a release.
const [version, ...names] = process.argv.slice(2);
if (!version || !names.length) {
  console.error("usage: node scripts/release-assets.mjs <version> <asset-name>...");
  process.exit(1);
}

const base = `https://github.com/crazyrabbit0/harbor/releases/download/v${version}`;
const ROWS = [
  ["Windows", "x64", [/_x64-setup\.exe$/]],
  ["macOS", "Apple silicon", [/_aarch64\.dmg$/]],
  ["macOS 15+", "Intel", [/_x64\.dmg$/]],
  ["Linux", "x86_64", [/_amd64\.deb$/, /_amd64\.AppImage$/, /_x86_64\.flatpak$/]],
  ["Linux", "arm64", [/_arm64\.deb$/, /_aarch64\.AppImage$/]],
];

const lines = ["| OS | Architecture | Download |", "| --- | --- | --- |"];
for (const [os, arch, patterns] of ROWS) {
  const files = patterns.flatMap((re) => names.filter((n) => re.test(n)));
  if (!files.length) continue;
  lines.push(`| ${os} | ${arch} | ${files.map((f) => `[${f}](${base}/${f})`).join("<br>")} |`);
}
console.log(lines.join("\n"));
