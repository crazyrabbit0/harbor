// Copies the VC++ runtime DLLs harbor.exe imports into src-tauri/vcruntime/, so the installer ships them app-locally.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("[vcruntime] not Windows, skipping");
  process.exit(0);
}

// harbor.exe imports MSVCP140.dll, which in turn imports both VCRUNTIME140 DLLs.
const VC_RUNTIME_DLLS = ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];
const ARCH = { x64: "x64", arm64: "arm64" }[process.arch];
if (!ARCH) throw new Error(`[vcruntime] unsupported Windows architecture: ${process.arch}`);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "src-tauri", "vcruntime");

function vsInstallations() {
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere)) return [];
  const out = execFileSync(vswhere, ["-all", "-products", "*", "-property", "installationPath"], {
    encoding: "utf8",
  });
  return out.split(/\r?\n/).filter(Boolean);
}

function versionKey(name) {
  return name
    .split(".")
    .map((part) => part.padStart(8, "0"))
    .join(".");
}

// The newest redist wins: an app-local copy must be at least as new as the toolset that linked the exe.
function findCrtDir() {
  const candidates = [];
  for (const install of vsInstallations()) {
    const redist = join(install, "VC", "Redist", "MSVC");
    if (!existsSync(redist)) continue;
    for (const version of readdirSync(redist)) {
      const archDir = join(redist, version, ARCH);
      if (!existsSync(archDir)) continue;
      for (const crt of readdirSync(archDir)) {
        const dir = join(archDir, crt);
        if (
          /^Microsoft\.VC\d+\.CRT$/.test(crt) &&
          VC_RUNTIME_DLLS.every((dll) => existsSync(join(dir, dll)))
        ) {
          candidates.push({ version, dir });
        }
      }
    }
  }
  candidates.sort((a, b) => versionKey(b.version).localeCompare(versionKey(a.version)));
  return candidates[0];
}

const found = findCrtDir();
if (!found) {
  throw new Error(
    "[vcruntime] no Microsoft.VC*.CRT folder found. Install the Visual Studio C++ build tools (they ship VC\\Redist\\MSVC).",
  );
}
mkdirSync(destination, { recursive: true });
for (const dll of VC_RUNTIME_DLLS) copyFileSync(join(found.dir, dll), join(destination, dll));
console.log(
  `[vcruntime] copied ${VC_RUNTIME_DLLS.join(", ")} from MSVC ${found.version} to ${destination}`,
);
