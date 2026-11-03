import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig, type ViteDevServer, type HttpProxy } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };
// Shared with safe-fetch.ts, which rewrites these hosts to /api-proxy/<host> on localhost.
import DEV_PROXY_HOST_LIST from "./src/lib/dev-proxy-hosts.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

// Folders (trailing /) and files the React Compiler memoizes; see docs/ARCHITECTURE-FOLLOWUPS.md.
const REACT_COMPILER_DIRS = [
  "/src/components/",
  "/src/chrome/",
  "/src/views/account/",
  "/src/views/addons/",
  "/src/views/anime/",
  "/src/views/award/",
  "/src/views/calendar/",
  "/src/views/catalogs/",
  "/src/views/collections/",
  "/src/views/curated-list/",
  "/src/views/detail/",
  "/src/views/discover/",
  "/src/views/dj/",
  "/src/views/downloads/",
  "/src/views/ebook/",
  "/src/views/feed/",
  "/src/views/filter/",
  "/src/views/group/",
  "/src/views/groups/",
  "/src/views/kids/",
  "/src/views/kids-detail/",
  "/src/views/live/",
  "/src/views/mobile/",
  "/src/views/movies/",
  "/src/views/multiview/",
  "/src/views/music/",
  "/src/views/people/",
  "/src/views/person/",
  "/src/views/play-picker/",
  "/src/views/playlist-vod/",
  "/src/views/plugins/",
  "/src/views/ratings/",
  "/src/views/shared-list/",
  "/src/views/shows/",
  "/src/views/spooktober/",
  "/src/views/sports/",
  "/src/views/wrapped/",
  "/src/views/addon-collection.tsx",
  "/src/views/addons.tsx",
  "/src/views/anime-award.tsx",
  "/src/views/anime.tsx",
  "/src/views/award.tsx",
  "/src/views/brands.tsx",
  "/src/views/calendar.tsx",
  "/src/views/captions-app.tsx",
  "/src/views/catalogs.tsx",
  "/src/views/collection.tsx",
  "/src/views/collections.tsx",
  "/src/views/curated-list.tsx",
  "/src/views/detail.tsx",
  "/src/views/discover.tsx",
  "/src/views/dj-deck-app.tsx",
  "/src/views/downloads.tsx",
  "/src/views/ebook.tsx",
  "/src/views/episode-detail.tsx",
  "/src/views/feed.tsx",
  "/src/views/filter.tsx",
  "/src/views/grid.tsx",
  "/src/views/group.tsx",
  "/src/views/groups.tsx",
  "/src/views/hdr-overlay-app.tsx",
  "/src/views/home.tsx",
  "/src/views/kids-detail.tsx",
  "/src/views/kids.tsx",
  "/src/views/library.tsx",
  "/src/views/live.tsx",
  "/src/views/manga.tsx",
  "/src/views/modal-overlay-app.tsx",
  "/src/views/movies.tsx",
  "/src/views/multiview.tsx",
  "/src/views/people.tsx",
  "/src/views/person.tsx",
  "/src/views/pip.tsx",
  "/src/views/play-picker.tsx",
  "/src/views/playlist-vod.tsx",
  "/src/views/plugins.tsx",
  "/src/views/queue.tsx",
  "/src/views/remote-app.tsx",
  "/src/views/service.tsx",
  "/src/views/shared-list.tsx",
  "/src/views/shows.tsx",
  "/src/views/sports.tsx",
  "/src/views/video-pip-settings.tsx",
  "/src/views/video-pip.tsx",
  "/src/views/wrapped.tsx",
];
// Babel runs only on these folders; every other file skips it and goes straight to esbuild.
const compilesReact = (id: string) =>
  REACT_COMPILER_DIRS.some((dir) => id.replace(/\\/g, "/").includes(dir));

function silenceMediapipeSourcemap() {
  return {
    name: "silence-mediapipe-sourcemap",
    enforce: "pre" as const,
    load(id: string) {
      const file = id.split("?")[0];
      if (file.includes("@mediapipe") && file.endsWith(".mjs")) {
        const code = readFileSync(file, "utf-8").replace(/\/\/#\s*sourceMappingURL=[^\n]*/g, "");
        return { code, map: null };
      }
      return null;
    },
  };
}

function servePublicMediapipe() {
  return {
    name: "serve-public-mediapipe",
    apply: "serve" as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith("/mp-wasm/") || path.includes("..") || !path.endsWith(".js")) {
          next();
          return;
        }
        let body: Buffer;
        try {
          body = readFileSync(`${server.config.root}/public${path}`);
        } catch {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(body);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const android = mode === "android" || process.env.HARBOR_TARGET === "android";
  const devHost = process.env.TAURI_DEV_HOST;
  return {
    staged: { "*": "vp check --fix" },
    plugins: [
      react({
        babel: (id) =>
          compilesReact(id)
            ? { plugins: [["babel-plugin-react-compiler", { panicThreshold: "none" }]] }
            : {},
      }),
      tailwindcss(),
      silenceMediapipeSourcemap(),
      servePublicMediapipe(),
    ],
    clearScreen: false,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __IS_BETA_BUILD__: JSON.stringify(process.env.HARBOR_CHANNEL === "beta"),
      __BUILD_ID__: JSON.stringify(
        process.env.HARBOR_BUILD_ID ||
          (() => {
            try {
              return execSync("git rev-parse --short HEAD").toString().trim();
            } catch {
              return "local";
            }
          })(),
      ),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    // Both entries ship. index-tv.html is what the TV window loads; index.html
    // exists only so web_server.rs has a page to hand the phone for /remote,
    // which the QR hand-off in onboarding depends on. Listing tv alone left the
    // phone staring at "web assets are not available in this build".
    // Vite 7 defaults to baseline-widely-available, a chrome107 floor. Android
    // TV sticks and Fire TV ship a System WebView well below that, and the
    // failure is a bare SyntaxError before React mounts, with no error surface
    // on a device you cannot open devtools on. Pin a floor the hardware meets.
    // This lowers syntax only; esbuild adds no API polyfills.
    ...(android
      ? {
          build: {
            target: "chrome87",
            rollupOptions: { input: { tv: "index-tv.html", main: "index.html" } },
          },
        }
      : {
          build: { rollupOptions: { input: { main: "index.html", retro: "retro-player.html" } } },
        }),
    server: {
      host: devHost || "127.0.0.1",
      port: 1420,
      strictPort: true,
      ...(devHost ? { hmr: { protocol: "ws", host: devHost, port: 1421 } } : {}),
      watch: {
        ignored: [
          "**/src-tauri/**",
          "**/android-native/**",
          "**/android/**",
          "**/android-extension-compat/**",
          "**/.gradle/**",
          "**/target/**",
          "**/work/**",
          "**/scratchpad/**",
          "**/.firecrawl/**",
          "**/.diag/**",
          "**/_private/**",
          "**/harbor-install-recovery/**",
        ],
      },
      proxy: Object.fromEntries(
        DEV_PROXY_HOST_LIST.map((host) => [
          `/api-proxy/${host}`,
          {
            target: `https://${host}`,
            changeOrigin: true,
            ...(["www.youtube.com", "kick.com", "prosettings.net"].includes(host)
              ? {
                  configure(proxy: HttpProxy.ProxyServer) {
                    proxy.on("proxyReq", (request) => {
                      // Public guide fetches are server-to-server, like native Harbor.
                      // Local webview fetch metadata describes our proxy, not the source.
                      for (const name of [
                        "origin",
                        "referer",
                        "sec-fetch-site",
                        "sec-fetch-mode",
                        "sec-fetch-dest",
                      ])
                        request.removeHeader(name);
                    });
                  },
                }
              : {}),
            ...(host === "steamcommunity.com"
              ? {
                  configure(proxy: HttpProxy.ProxyServer) {
                    proxy.on("proxyRes", (response, request) => {
                      // Keep canonical achievement redirects (440 → TF2) inside the dev proxy.
                      if (
                        !/^\/stats\/[^/]+\/achievements\/?(?:\?|$)/.test(request.url ?? "") ||
                        !response.headers.location
                      )
                        return;
                      try {
                        const destination = new URL(
                          response.headers.location,
                          "https://steamcommunity.com",
                        );
                        if (
                          destination.origin === "https://steamcommunity.com" &&
                          /^\/stats\/[^/]+\/achievements\/?$/.test(destination.pathname)
                        ) {
                          response.headers.location = `/api-proxy/steamcommunity.com${destination.pathname}${destination.search}`;
                        }
                      } catch {
                        /* Leave malformed or unrelated upstream redirects unchanged. */
                      }
                    });
                  },
                }
              : {}),
            rewrite: (path: string) => path.replace(`/api-proxy/${host}`, ""),
          },
        ]),
      ),
    },
    resolve: {
      alias: { "@": "/src" },
    },
    assetsInclude: ["**/*.onnx", "**/*.tflite"],
    // JSON.parse beats an object literal at startup; named JSON imports are unsupported, use the default export.
    json: { stringify: true },
    optimizeDeps: {
      // Scan only app entries, not the installer or local HTML previews.
      entries: ["index.html", "index-tv.html"],
      // Reached only from a lazy route's own lazy child, so the scanner does not find it from an
      // entry. Discovered at runtime instead, it answers the first request with a 504 and a reload
      // the error boundary swallows, which strands that route until the dep cache is rebuilt.
      // react/compiler-runtime: plugin-react adds it only for a static babel object, not a function.
      include: ["qrcode", "react/compiler-runtime"],
      exclude: ["onnxruntime-web", "@mediapipe/tasks-vision"],
    },
    worker: { format: "es" },
  };
});
