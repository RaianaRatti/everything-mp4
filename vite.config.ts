/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** A file inside node_modules (the packages' "exports" don't list every file we need). */
const pkg = (path: string) => fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));

const FFMPEG_VERSION = (
  JSON.parse(readFileSync(pkg("@ffmpeg/core/package.json"), "utf8")) as { version: string }
).version;

/** The video engine's files, by the path the app loads them from under /ffmpeg/<version>/. */
const ENGINE_FILES: Record<string, string> = {
  "core/ffmpeg-core.js": "@ffmpeg/core/dist/esm/ffmpeg-core.js",
  "core/ffmpeg-core.wasm": "@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
  "core-mt/ffmpeg-core.js": "@ffmpeg/core-mt/dist/esm/ffmpeg-core.js",
  "core-mt/ffmpeg-core.wasm": "@ffmpeg/core-mt/dist/esm/ffmpeg-core.wasm",
  "core-mt/ffmpeg-core.worker.js": "@ffmpeg/core-mt/dist/esm/ffmpeg-core.worker.js",
};

/**
 * Hosts ffmpeg.wasm from the app itself (no CDN). The files are served byte for byte: Vite's
 * usual handling of JS would rewrite the engine's worker script and break it.
 */
function ffmpegEngine(): Plugin {
  const prefix = `/ffmpeg/${FFMPEG_VERSION}/`;
  return {
    name: "ffmpeg-engine",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        const file = path.startsWith(prefix) ? ENGINE_FILES[path.slice(prefix.length)] : undefined;
        if (!file) return next();
        res.setHeader(
          "Content-Type",
          file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        createReadStream(pkg(file)).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(ENGINE_FILES)) {
        this.emitFile({
          type: "asset",
          fileName: `ffmpeg/${FFMPEG_VERSION}/${name}`,
          source: readFileSync(pkg(file)),
        });
      }
    },
  };
}

/**
 * Cross-origin isolation lets the video engine use its faster multi-threaded build, which needs
 * SharedArrayBuffer. Without these headers it falls back to the single-thread build. Hosts need
 * the same headers in production; see the README.
 */
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), ffmpegEngine()],
  define: { __FFMPEG_VERSION__: JSON.stringify(FFMPEG_VERSION) },
  server: { headers: isolation },
  preview: { headers: isolation },
  // ffmpeg.wasm starts its own worker from a file next to it; pre-bundling would break that path.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  worker: { format: "es" },
  test: { include: ["src/**/*.test.ts"] },
});
