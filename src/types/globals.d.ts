/** The ffmpeg.wasm core version, whose files are served under /ffmpeg/<version>/ (see vite.config.ts). */
declare const __FFMPEG_VERSION__: string;

/** How many parts each engine build's .wasm is served in ("core", "core-mt"); see vite.config.ts. */
declare const __ENGINE_WASM_PARTS__: Record<string, number>;
