/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createReadStream, readFileSync, statSync } from "node:fs";
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
 * Hosts like Cloudflare Pages refuse files over 25 MiB, and each engine .wasm is about 31 MB, so
 * the .wasm files are served in parts (`ffmpeg-core.wasm.part0`, `.part1`, …) that the app joins
 * back together after downloading (see lib/ffmpeg/engine.ts).
 */
const PART_BYTES = 20 * 1024 ** 2;

/** How many parts each build's .wasm is split into, by folder ("core", "core-mt"). */
const WASM_PARTS = Object.fromEntries(
  Object.entries(ENGINE_FILES)
    .filter(([name]) => name.endsWith(".wasm"))
    .map(([name, file]) => [name.split("/")[0]!, Math.ceil(statSync(pkg(file)).size / PART_BYTES)]),
);

/** The byte range of part `n` of a file. */
const partRange = (n: number) => ({ start: n * PART_BYTES, end: (n + 1) * PART_BYTES - 1 });

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
        const rel = path.startsWith(prefix) ? path.slice(prefix.length) : "";
        const part = /^(.*\.wasm)\.part(\d+)$/.exec(rel);
        const file = ENGINE_FILES[part ? part[1]! : rel];
        if (!file) return next();
        res.setHeader(
          "Content-Type",
          part ? "application/octet-stream" : "text/javascript",
        );
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        createReadStream(pkg(file), part ? partRange(Number(part[2])) : undefined).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(ENGINE_FILES)) {
        const source = readFileSync(pkg(file));
        if (!name.endsWith(".wasm")) {
          this.emitFile({ type: "asset", fileName: `ffmpeg/${FFMPEG_VERSION}/${name}`, source });
          continue;
        }
        for (let n = 0; n * PART_BYTES < source.length; n++) {
          this.emitFile({
            type: "asset",
            fileName: `ffmpeg/${FFMPEG_VERSION}/${name}.part${n}`,
            source: source.subarray(n * PART_BYTES, (n + 1) * PART_BYTES),
          });
        }
      }
    },
  };
}

/**
 * onnxruntime-web (used by auto captions) references its ~26 MB .wasm in a way that makes the
 * build copy it, but transformers.js loads it from the jsDelivr CDN at run time, so the copy is
 * never used, and it's over Cloudflare Pages' 25 MiB file limit. Leave it out.
 */
function dropUnusedOrtWasm(): Plugin {
  return {
    name: "drop-unused-ort-wasm",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/(^|\/)ort-wasm[^/]*\.wasm$/.test(name)) delete bundle[name];
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
  plugins: [react(), tailwindcss(), ffmpegEngine(), dropUnusedOrtWasm()],
  define: {
    __FFMPEG_VERSION__: JSON.stringify(FFMPEG_VERSION),
    __ENGINE_WASM_PARTS__: JSON.stringify(WASM_PARTS),
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  // ffmpeg.wasm starts its own worker from a file next to it; pre-bundling would break that path.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  worker: { format: "es" },
  test: { include: ["src/**/*.test.ts"] },
});
