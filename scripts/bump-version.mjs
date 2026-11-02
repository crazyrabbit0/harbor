#!/usr/bin/env node
// `<x.y.z>` writes that version into every file that carries it; `--next` prints the next release version.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+$/;

const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const parse = (v) => v.split(".").map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function replaceOnce(path, pattern, replacement) {
  const text = read(path);
  if (!pattern.test(text)) throw new Error(`${path}: no version matched ${pattern}`);
  writeFileSync(join(root, path), text.replace(pattern, replacement));
}

// The checked-in version ships as is until it has a tag; after that each release takes the next patch.
function nextVersion() {
  const current = parse(JSON.parse(read("package.json")).version);
  const tags = execFileSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((t) => t.trim().slice(1))
    .filter((t) => SEMVER.test(t))
    .map(parse)
    .sort(cmp);
  const latest = tags.at(-1);
  const next =
    !latest || cmp(current, latest) > 0 ? current : [latest[0], latest[1], latest[2] + 1];
  return next.join(".");
}

function setVersion(version) {
  for (const path of [
    "package.json",
    "src-tauri/tauri.conf.json",
    "installer/package.json",
    "installer/src-tauri/tauri.conf.json",
  ]) {
    replaceOnce(path, /"version": "[^"]+"/, `"version": "${version}"`);
  }
  for (const path of ["src-tauri/Cargo.toml", "installer/src-tauri/Cargo.toml"]) {
    replaceOnce(path, /^version = "[^"]+"/m, `version = "${version}"`);
  }
  for (const [path, name] of [
    ["src-tauri/Cargo.lock", "harbor"],
    ["src-tauri/Cargo.lock", "harbor-games"],
    ["src-tauri/Cargo.lock", "harbor-music"],
    ["src-tauri/Cargo.lock", "harbor-livetv"],
    ["src-tauri/Cargo.lock", "harbor-cast"],
    ["installer/src-tauri/Cargo.lock", "harbor-setup"],
  ]) {
    replaceOnce(
      path,
      new RegExp(`name = "${name}"\\nversion = "[^"]+"`),
      `name = "${name}"\nversion = "${version}"`,
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  replaceOnce(
    "flatpak/site.harbor.Harbor.metainfo.xml",
    /<release version="[^"]+" date="[^"]+"\s*\/>/,
    `<release version="${version}" date="${date}" />`,
  );
}

const arg = process.argv[2];
if (arg === "--next") {
  console.log(nextVersion());
} else if (arg && SEMVER.test(arg)) {
  setVersion(arg);
  console.log(`version set to ${arg}`);
} else {
  console.error("usage: node scripts/bump-version.mjs <x.y.z> | --next");
  process.exit(1);
}
