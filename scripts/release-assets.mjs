#!/usr/bin/env node
// `node scripts/release-assets.mjs <version> <asset-name>...` prints the HTML download table for a release.
const [version, ...names] = process.argv.slice(2);
if (!version || !names.length) {
  console.error("usage: node scripts/release-assets.mjs <version> <asset-name>...");
  process.exit(1);
}

const base = `https://github.com/crazyrabbit0/harbor/releases/download/v${version}`;
const MAC =
  "Needs macOS 15 or newer<br><em>Not notarized: after installing, run <code>xattr -dr com.apple.quarantine /Applications/Harbor.app</code></em>";
const APPIMAGE = "Any distro, runs as one file and updates itself";
const DEB = "Debian, Ubuntu and derivatives";
// HTML, not a Markdown table: only HTML lets a platform's rows share one cell through rowspan.
const ROWS = [
  ["Windows (x64)", "Installer", /_x64-setup\.exe$/, "Updates itself from Settings &gt; Updates"],
  ["macOS (Apple silicon)", "Disk image", /_aarch64\.dmg$/, MAC],
  ["macOS (Intel)", "Disk image", /_x64\.dmg$/, MAC],
  ["Linux (x86_64)", "AppImage", /_amd64\.AppImage$/, APPIMAGE],
  ["Linux (x86_64)", "Debian package", /_amd64\.deb$/, DEB],
  [
    "Linux (x86_64)",
    "Flatpak",
    /_x86_64\.flatpak$/,
    "<code>flatpak install --user &lt;file&gt;</code>",
  ],
  ["Linux (arm64)", "AppImage", /_aarch64\.AppImage$/, APPIMAGE],
  ["Linux (arm64)", "Debian package", /_arm64\.deb$/, DEB],
];

const rows = ROWS.flatMap(([platform, label, re, notes]) => {
  const file = names.find((n) => re.test(n));
  return file ? [{ platform, label, file, notes }] : [];
});
const lines = ["<table>", "<tr><th>Platform</th><th>Download</th><th>Notes</th></tr>"];
rows.forEach((row, i) => {
  const cells = [];
  if (rows[i - 1]?.platform !== row.platform) {
    const count = rows.slice(i).filter((r) => r.platform === row.platform).length;
    cells.push(
      count > 1 ? `<td rowspan="${count}">${row.platform}</td>` : `<td>${row.platform}</td>`,
    );
  }
  cells.push(`<td><a href="${base}/${row.file}">${row.label}</a></td>`, `<td>${row.notes}</td>`);
  lines.push(`<tr>${cells.join("")}</tr>`);
});
lines.push("</table>");
console.log(lines.join("\n"));
