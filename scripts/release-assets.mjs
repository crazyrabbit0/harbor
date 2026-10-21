#!/usr/bin/env node
// `node scripts/release-assets.mjs <version> <asset-name>...` prints the markdown download table for a release.
const [version, ...names] = process.argv.slice(2);
if (!version || !names.length) {
  console.error("usage: node scripts/release-assets.mjs <version> <asset-name>...");
  process.exit(1);
}

const base = `https://github.com/crazyrabbit0/harbor/releases/download/v${version}`;
const MAC =
  "macOS 15 or newer. Not notarized: after installing, run `xattr -dr com.apple.quarantine /Applications/Harbor.app`";
const ROWS = [
  ["Windows (x64)", "Installer", /_x64-setup\.exe$/, "Updates itself from Settings > Updates"],
  ["macOS (Apple silicon)", "Disk image", /_aarch64\.dmg$/, MAC],
  ["macOS (Intel)", "Disk image", /_x64\.dmg$/, MAC],
  [
    "Linux (x86_64)",
    "AppImage",
    /_amd64\.AppImage$/,
    "Any distro, runs as one file and updates itself",
  ],
  ["Linux (x86_64)", "Debian package", /_amd64\.deb$/, "Debian, Ubuntu and derivatives"],
  ["Linux (x86_64)", "Flatpak", /_x86_64\.flatpak$/, "`flatpak install --user <file>`"],
  [
    "Linux (arm64)",
    "AppImage",
    /_aarch64\.AppImage$/,
    "Any distro, runs as one file and updates itself",
  ],
  ["Linux (arm64)", "Debian package", /_arm64\.deb$/, "Debian, Ubuntu and derivatives"],
];

const lines = ["| Platform | Download | Notes |", "| --- | --- | --- |"];
for (const [platform, label, re, notes] of ROWS) {
  const file = names.find((n) => re.test(n));
  if (file) lines.push(`| ${platform} | [${label}](${base}/${file}) | ${notes} |`);
}
console.log(lines.join("\n"));
