import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = "0a81c004aae0ee7d512b9a26e38f66281f9591e84e1663215cc3a36a4bde6f6a";
// Tried in order; the shinchiro archive is the unmodified mpv-dev build the DLL came from.
const SOURCES = process.env.HARBOR_LIBMPV_URL
  ? [process.env.HARBOR_LIBMPV_URL]
  : [
      "https://github.com/crazyrabbit0/harbor/releases/download/libmpv-0a81c004aae0/libmpv-2.dll",
      "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260927/mpv-dev-x86_64-20260927-git-a1bf4b6559.7z",
    ];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "src-tauri", "libmpv", "libmpv-2.dll");
const digest = (buf) => createHash("sha256").update(buf).digest("hex");

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) return path;
  }
  return null;
}

function dllFrom(url, buf) {
  if (!url.endsWith(".7z")) return buf;
  const temp = mkdtempSync(join(tmpdir(), "harbor-libmpv-"));
  try {
    const archive = join(temp, "mpv-dev.7z");
    writeFileSync(archive, buf);
    execFileSync("7z", ["x", "-y", archive, `-o${temp}`], { stdio: "ignore" });
    const dll = findFile(temp, "libmpv-2.dll");
    if (!dll) throw new Error("libmpv-2.dll not found in the archive");
    return readFileSync(dll);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.platform !== "win32" && !process.env.HARBOR_LIBMPV_FORCE) {
  console.log("[libmpv] not Windows, skipping (mac and linux link system libmpv)");
  process.exit(0);
}

if (existsSync(dest) && digest(readFileSync(dest)) === SHA256) {
  console.log("[libmpv] libmpv-2.dll already present and verified");
  process.exit(0);
}

for (const url of SOURCES) {
  console.log(`[libmpv] fetching ${url}`);
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
    const buf = dllFrom(url, Buffer.from(await res.arrayBuffer()));
    const got = digest(buf);
    if (got !== SHA256) throw new Error(`checksum mismatch (expected ${SHA256}, got ${got})`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    console.log(`[libmpv] wrote ${dest} (${(buf.length / 1048576).toFixed(1)} MB)`);
    process.exit(0);
  } catch (e) {
    console.error(`[libmpv] ${e instanceof Error ? e.message : e}`);
  }
}
console.error(
  "[libmpv] set HARBOR_LIBMPV_URL to a mirror, or drop libmpv-2.dll into src-tauri/libmpv/",
);
process.exit(1);
