// Runs the React Compiler over each folder (default: REACT_COMPILER_DIRS in vite.config.ts) and lists components it skips.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const require = createRequire(join(root, "package.json"));
// pnpm keeps @babel/core under @vitejs/plugin-react, which runs the compiler in builds.
const babel = createRequire(require.resolve("@vitejs/plugin-react"))("@babel/core");
const compiler = require.resolve("babel-plugin-react-compiler");

function configuredDirs() {
  const config = readFileSync(join(root, "vite.config.ts"), "utf8");
  const list = config.match(/REACT_COMPILER_DIRS = \[([^\]]*)\]/)?.[1] ?? "";
  return [...list.matchAll(/"\/([^"]+)\/"/g)].map((m) => m[1]);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });

const dirs = process.argv.length > 2 ? process.argv.slice(2) : configuredDirs();
let failed = false;
for (const dir of dirs) {
  let compiled = 0;
  const skipped = [];
  const optedOut = [];
  for (const file of walk(join(root, dir))) {
    const source = readFileSync(file, "utf8");
    // A component that declares "use no memo" opts out on purpose (e.g. an incompatible library); list it, don't fail.
    if (/^\s*["']use no memo["'];?\s*$/m.test(source)) {
      optedOut.push(relative(root, file));
      continue;
    }
    const events = [];
    babel.transformSync(source, {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ["jsx", "typescript"] },
      plugins: [
        [compiler, { panicThreshold: "none", logger: { logEvent: (_f, e) => events.push(e) } }],
      ],
    });
    for (const e of events) {
      if (e.kind === "CompileSuccess") compiled += 1;
      else if (e.kind === "CompileError" || e.kind === "PipelineError") {
        const reason = e.detail?.reason ?? e.detail?.options?.reason ?? e.data ?? "";
        skipped.push(`${relative(root, file)}: ${String(reason).slice(0, 160)}`);
      }
    }
  }
  const opted = optedOut.length ? `, ${optedOut.length} opted out` : "";
  console.log(`${dir}: ${compiled} compiled, ${skipped.length} skipped${opted}`);
  for (const line of skipped) console.log(`  ${line}`);
  for (const file of optedOut) console.log(`  opted out ("use no memo"): ${file}`);
  if (skipped.length) failed = true;
}
process.exitCode = failed ? 1 : 0;
