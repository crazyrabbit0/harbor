/*
 * fetch-binaries.mjs
 *
 * Downloads the Tauri "externalBin" sidecars (yt-dlp, ffmpeg, ffprobe) for the
 * CURRENT OS + arch and writes them to src-tauri/binaries/<name>-<triple>[.exe],
 * which is exactly the path tauri.conf.json externalBin resolves to at build time.
 *
 * Why this script exists:
 *   src-tauri/binaries/* is gitignored (see .gitignore), so a fresh clone ships
 *   NONE of these binaries. Without them `tauri build` dies with
 *   "resource path binaries/yt-dlp-<triple> doesn't exist". Run this once (via
 *   `pnpm run setup`) before building.
 *
 * ----------------------------------------------------------------------------
 * SOURCES. yt-dlp and the Linux ffmpeg are "latest/rolling" upstream builds and
 * are NOT checksum pinned. Windows ffmpeg/ffprobe are pinned to one gyan.dev
 * release (FFMPEG_WIN below), mirrored on crazyrabbit0/harbor-deps; repin with
 * `node scripts/fetch-binaries.mjs --latest`.
 * ----------------------------------------------------------------------------
 *
 * yt-dlp  (single self-contained binary, no archive)
 *   linux  x86_64 : github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
 *   linux  aarch64: github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64
 *   macOS  (both) : github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
 *                   (universal2; needs macOS 12+. For macOS 11 use yt-dlp_macos_legacy.)
 *   windows x86_64: github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
 *
 * ffmpeg + ffprobe  (extracted from an archive)
 *   linux  x86_64 : github.com/BtbN/FFmpeg-Builds latest ffmpeg-master-latest-linux64-gpl.tar.xz
 *   linux  aarch64: github.com/BtbN/FFmpeg-Builds latest ffmpeg-master-latest-linuxarm64-gpl.tar.xz
 *                   (was johnvansickle.com, which 415-blocks CI/automated GETs. BtbN is a
 *                    static standalone build hosted on GitHub releases, same as yt-dlp above.)
 *   macOS  (both) : Homebrew's ffmpeg (installed with mpv). This copy only links on the
 *                   build machine; macos-bundle-libmpv.py prepare replaces it with one
 *                   relinked against the bundled Frameworks.
 *   windows x86_64: gyan.dev ffmpeg-<version>-essentials_build.zip, pinned by SHA-256:
 *                   harbor-deps mirror, then GyanD/codexffmpeg, then gyan.dev packages/
 *
 * Extraction tools (documented external dependency):
 *   .tar.xz -> `tar -xJf`  (linux; GNU tar + xz-utils)
 *   .zip    -> macOS: `unzip`   windows: System32 tar.exe (bsdtar)   (both built in)
 *
 * Env overrides (mirrors / air-gapped): HARBOR_YTDLP_URL, HARBOR_FFMPEG_URL,
 * HARBOR_FFPROBE_URL replace the resolved URL for the current platform (on Windows
 * the zip must still match the pin; macOS ignores them and uses Homebrew). Or just
 * drop the finished binary into src-tauri/binaries/<name>-<triple>[.exe] by hand.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const root = join(dirname(script), "..");
const binDir = join(root, "src-tauri", "binaries");

function targetTriple() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

const EXE = process.platform === "win32" ? ".exe" : "";
const triple = targetTriple();
const mb = (p) => (statSync(p).size / 1048576).toFixed(0);

const YTDLP = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";
const FFMPEG_WIN_VERSION = "9.0.2";
const FFMPEG_WIN_SHA256 = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
const FFMPEG_WIN_ZIP = `ffmpeg-${FFMPEG_WIN_VERSION}-essentials_build.zip`;
const FFMPEG_WIN_TAG = `ffmpeg-${FFMPEG_WIN_SHA256.slice(0, 12)}`;
// Tried in order; all three serve the same zip, which the pinned SHA-256 checks.
const FFMPEG_WIN_URLS = [
  `https://github.com/crazyrabbit0/harbor-deps/releases/download/${FFMPEG_WIN_TAG}/${FFMPEG_WIN_ZIP}`,
  `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_WIN_VERSION}/${FFMPEG_WIN_ZIP}`,
  `https://www.gyan.dev/ffmpeg/builds/packages/${FFMPEG_WIN_ZIP}`,
];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SOURCES = {
  "yt-dlp": {
    "x86_64-unknown-linux-gnu": { kind: "raw", url: `${YTDLP}/yt-dlp_linux` },
    "aarch64-unknown-linux-gnu": { kind: "raw", url: `${YTDLP}/yt-dlp_linux_aarch64` },
    "x86_64-apple-darwin": { kind: "raw", url: `${YTDLP}/yt-dlp_macos` },
    "aarch64-apple-darwin": { kind: "raw", url: `${YTDLP}/yt-dlp_macos` },
    "x86_64-pc-windows-msvc": { kind: "raw", url: `${YTDLP}/yt-dlp.exe` },
  },
  ffmpeg: {
    "x86_64-unknown-linux-gnu": {
      kind: "tar.xz",
      url: `${BTBN}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
      member: "ffmpeg",
    },
    "aarch64-unknown-linux-gnu": {
      kind: "tar.xz",
      url: `${BTBN}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
      member: "ffmpeg",
    },
    "x86_64-apple-darwin": { kind: "brew", formula: "ffmpeg" },
    "aarch64-apple-darwin": { kind: "brew", formula: "ffmpeg" },
    "x86_64-pc-windows-msvc": { kind: "pinned-zip", member: "ffmpeg.exe" },
  },
  ffprobe: {
    "x86_64-unknown-linux-gnu": {
      kind: "tar.xz",
      url: `${BTBN}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
      member: "ffprobe",
    },
    "aarch64-unknown-linux-gnu": {
      kind: "tar.xz",
      url: `${BTBN}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
      member: "ffprobe",
    },
    "x86_64-apple-darwin": { kind: "brew", formula: "ffmpeg" },
    "aarch64-apple-darwin": { kind: "brew", formula: "ffmpeg" },
    "x86_64-pc-windows-msvc": { kind: "pinned-zip", member: "ffprobe.exe" },
  },
};

const OVERRIDE = {
  "yt-dlp": process.env.HARBOR_YTDLP_URL,
  ffmpeg: process.env.HARBOR_FFMPEG_URL,
  ffprobe: process.env.HARBOR_FFPROBE_URL,
};

const ENVVAR = {
  "yt-dlp": "HARBOR_YTDLP_URL",
  ffmpeg: "HARBOR_FFMPEG_URL",
  ffprobe: "HARBOR_FFPROBE_URL",
};

const dlCache = new Map();
async function download(url) {
  if (dlCache.has(url)) return dlCache.get(url);
  console.log(`[binaries] fetching ${url}`);
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, accept: "*/*" },
  });
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  const buf = Buffer.from(await res.arrayBuffer());
  dlCache.set(url, buf);
  return buf;
}

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function findMember(dir, name) {
  let best = null;
  let bestSize = -1;
  for (const p of walk(dir, [])) {
    if (basename(p) !== name) continue;
    const size = statSync(p).size;
    if (size > bestSize) {
      best = p;
      bestSize = size;
    }
  }
  return best;
}

// Windows' own bsdtar reads zip; Git's GNU tar cannot, and Expand-Archive fails under PowerShell 7 on the runners.
const windowsTar = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

function extractMember(buf, kind, member, dest) {
  const tmp = mkdtempSync(join(tmpdir(), "harbor-bin-"));
  try {
    const archive = join(tmp, kind === "tar.xz" ? "archive.tar.xz" : "archive.zip");
    writeFileSync(archive, buf);
    const outDir = join(tmp, "out");
    mkdirSync(outDir, { recursive: true });
    if (kind === "tar.xz") {
      execFileSync("tar", ["-xJf", archive, "-C", outDir], { stdio: "inherit" });
    } else if (process.platform === "win32") {
      execFileSync(windowsTar(), ["-xf", archive, "-C", outDir], { stdio: "inherit" });
    } else {
      execFileSync("unzip", ["-oq", archive, "-d", outDir], { stdio: "inherit" });
    }
    const found = findMember(outDir, member);
    if (!found) throw new Error(`could not find ${member} inside archive`);
    copyFileSync(found, dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let pinnedZip;
function fetchPinnedZip(override) {
  pinnedZip ??= (async () => {
    for (const url of override ? [override] : FFMPEG_WIN_URLS) {
      try {
        const buf = await download(url);
        const got = sha256(buf);
        if (got !== FFMPEG_WIN_SHA256)
          throw new Error(`checksum mismatch (expected ${FFMPEG_WIN_SHA256}, got ${got})`);
        return buf;
      } catch (err) {
        console.error(`[binaries] ${url}: ${err.message}`);
      }
    }
    throw new Error(`no source served ${FFMPEG_WIN_ZIP} with the pinned SHA-256`);
  })();
  return pinnedZip;
}

function copyFromBrew(formula, name, dest) {
  let prefix;
  try {
    prefix = execFileSync("brew", ["--prefix", formula], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(`Homebrew ${formula} is not available; run \`brew install ${formula}\``);
  }
  const binary = join(prefix, "bin", name);
  if (!existsSync(binary)) throw new Error(`${binary} not found; run \`brew install ${formula}\``);
  copyFileSync(binary, dest);
}

// Repins the Windows ffmpeg/ffprobe to gyan.dev's newest release; the zip still has to be uploaded to harbor-deps.
async function pinLatest() {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch("https://api.github.com/repos/GyanD/codexffmpeg/releases/latest", {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`release lookup failed (${res.status} ${res.statusText})`);
  const release = await res.json();
  const version = release.tag_name;
  const zip = `ffmpeg-${version}-essentials_build.zip`;
  const asset = release.assets.find((a) => a.name === zip);
  if (!asset) throw new Error(`no ${zip} in GyanD/codexffmpeg ${version}`);
  const buf = await download(asset.browser_download_url);
  const sha = sha256(buf);
  const source = readFileSync(script, "utf8");
  const pinned = source
    .replace(/^const FFMPEG_WIN_VERSION = "[^"]+";/m, `const FFMPEG_WIN_VERSION = "${version}";`)
    .replace(/^const FFMPEG_WIN_SHA256 = "[0-9a-f]{64}";/m, `const FFMPEG_WIN_SHA256 = "${sha}";`);
  if (pinned.includes(FFMPEG_WIN_SHA256) && sha !== FFMPEG_WIN_SHA256)
    throw new Error("could not rewrite the pin");
  writeFileSync(script, pinned);
  const archive = join(tmpdir(), zip);
  writeFileSync(archive, buf);
  console.log(`[binaries] pinned ${zip} (SHA-256 ${sha})`);
  console.log(
    `[binaries] publish it: gh release create ffmpeg-${sha.slice(0, 12)} "${archive}" --repo crazyrabbit0/harbor-deps --title "ffmpeg ${version} (gyan.dev essentials)"`,
  );
  console.log(
    "[binaries] then delete src-tauri/binaries/ffmpeg-*.exe and ffprobe-*.exe and re-run",
  );
}

if (process.argv.includes("--latest")) {
  try {
    await pinLatest();
    process.exit(0);
  } catch (err) {
    console.error(`[binaries] ${err.message}`);
    process.exit(1);
  }
}

function hint(name) {
  const lines = [
    `[binaries] fix: set ${ENVVAR[name]} to a mirror URL, or drop a working`,
    `[binaries]      ${name}-${triple}${EXE} into src-tauri/binaries/ by hand.`,
  ];
  if (name === "yt-dlp")
    lines.push("[binaries]      source: github.com/yt-dlp/yt-dlp/releases/latest");
  else
    lines.push(
      "[binaries]      sources: BtbN (linux), Homebrew ffmpeg (macOS), pinned gyan.dev zip (windows)",
    );
  return lines.join("\n");
}

if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

let ok = true;
for (const name of ["yt-dlp", "ffmpeg", "ffprobe"]) {
  const dest = join(binDir, `${name}-${triple}${EXE}`);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`[binaries] ${name}-${triple}${EXE} already present (${mb(dest)} MB)`);
    continue;
  }
  const spec = SOURCES[name][triple];
  if (!spec) {
    console.error(`[binaries] no known source for ${name} on ${triple}`);
    console.error(hint(name));
    ok = false;
    continue;
  }
  try {
    if (spec.kind === "brew") copyFromBrew(spec.formula, name, dest);
    else if (spec.kind === "pinned-zip")
      extractMember(await fetchPinnedZip(OVERRIDE[name]), "zip", spec.member, dest);
    else {
      const buf = await download(OVERRIDE[name] ?? spec.url);
      if (spec.kind === "raw") writeFileSync(dest, buf);
      else extractMember(buf, spec.kind, spec.member, dest);
    }
    if (process.platform !== "win32") chmodSync(dest, 0o755);
    console.log(`[binaries] wrote ${name}-${triple}${EXE} (${mb(dest)} MB)`);
  } catch (err) {
    console.error(`[binaries] ${name} failed: ${err.message}`);
    console.error(hint(name));
    ok = false;
  }
}

if (!ok) {
  console.error("[binaries] one or more sidecars are missing; see messages above");
  process.exit(1);
}
console.log(`[binaries] all sidecars ready for ${triple}`);
