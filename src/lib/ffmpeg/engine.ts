import { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import { create } from "zustand";
import { FriendlyError } from "../errors";
import { extension } from "../files";
import { limitThreads } from "./args";
import { explainFailure, parseDurationLine, parseListing, parseProgressTime } from "./logs";

/** The engine's download size, for telling people before they load it. */
export const ENGINE_BYTES = 32 * 1024 ** 2;

/** Inputs bigger than this may not fit in the engine's memory. */
export const ENGINE_WARN_BYTES = 1.5 * 1024 ** 3;

export const CACHE_NAME = "everything-mp4-engine-v1";

/**
 * The multi-threaded build is faster but needs SharedArrayBuffer, which browsers only allow on
 * pages served with cross-origin isolation headers (see vite.config.ts).
 */
function threadsAvailable(): boolean {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
}

/** The engine's files, hosted by the app itself (see vite.config.ts). */
function files() {
  const base = `${import.meta.env.BASE_URL}ffmpeg/${__FFMPEG_VERSION__}/`;
  return threadsAvailable()
    ? {
        core: `${base}core-mt/ffmpeg-core.js`,
        wasm: `${base}core-mt/ffmpeg-core.wasm`,
        wasmParts: __ENGINE_WASM_PARTS__["core-mt"] ?? 1,
        worker: `${base}core-mt/ffmpeg-core.worker.js` as string | undefined,
      }
    : {
        core: `${base}core/ffmpeg-core.js`,
        wasm: `${base}core/ffmpeg-core.wasm`,
        wasmParts: __ENGINE_WASM_PARTS__["core"] ?? 1,
        worker: undefined,
      };
}

export type EngineStatus = "idle" | "loading" | "ready" | "error";

export const useEngine = create<{
  status: EngineStatus;
  /** Download progress, 0–1, while loading. */
  fraction: number;
  error: string | null;
  threads: boolean;
}>(() => ({ status: "idle", fraction: 0, error: null, threads: threadsAvailable() }));

/** Whether the engine was downloaded before, so loading it is quick and needs no download. */
export async function isEngineCached(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(new URL(files().wasm, location.href))) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Fetches a file from the engine cache, or downloads (and caches) it with progress. A file served
 * in `parts` is downloaded as `<url>.part0`, `.part1`, … and joined; it's cached whole under `url`.
 */
async function cachedBlobUrl(
  url: string,
  type: string,
  onBytes: (bytes: number, total: number | null) => void,
  parts = 1,
): Promise<string> {
  const absolute = new URL(url, location.href);
  let cache: Cache | null = null;
  try {
    // Cache Storage only takes http(s) URLs; tiny files may be inlined as data: URLs.
    if (absolute.protocol.startsWith("http")) cache = await caches.open(CACHE_NAME);
  } catch {
    cache = null;
  }
  const hit = await cache?.match(absolute);
  if (hit) {
    const blob = await hit.blob();
    onBytes(blob.size, blob.size);
    return URL.createObjectURL(new Blob([blob], { type }));
  }

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (let n = 0; n < parts; n++) {
    const response = await fetch(parts > 1 ? new URL(`${absolute.href}.part${n}`) : absolute);
    if (!response.ok || !response.body) {
      throw new FriendlyError(
        "Couldn't download the video engine. Check your connection and try again.",
      );
    }
    // The size of a single file is known up front; for parts, the progress estimate is used.
    const total = parts === 1 ? Number(response.headers.get("Content-Length")) || null : null;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onBytes(received, total);
    }
  }
  const blob = new Blob(chunks, { type });
  await cache
    ?.put(absolute, new Response(blob, { headers: { "Content-Type": type } }))
    .catch(() => {});
  return URL.createObjectURL(blob);
}

let urls: Promise<{ coreURL: string; wasmURL: string; workerURL?: string }> | null = null;
let instance: Promise<FFmpeg> | null = null;

/** Downloads (once) and starts the video engine. Safe to call many times. */
export function loadEngine(): Promise<FFmpeg> {
  instance ??= (async () => {
    const state = useEngine.getState();
    if (state.status !== "ready")
      useEngine.setState({ status: "loading", fraction: 0, error: null });
    try {
      urls ??= (async () => {
        const f = files();
        const progress = new Map<string, [number, number]>();
        const report = (key: string, expected: number) => (bytes: number, total: number | null) => {
          progress.set(key, [bytes, total ?? expected]);
          let got = 0;
          let all = 0;
          for (const [b, t] of progress.values()) {
            got += b;
            all += t;
          }
          useEngine.setState({ fraction: Math.min(1, got / Math.max(all, ENGINE_BYTES)) });
        };
        const [core, wasm, worker] = await Promise.all([
          cachedBlobUrl(f.core, "text/javascript", report("core", 130_000)),
          cachedBlobUrl(f.wasm, "application/wasm", report("wasm", ENGINE_BYTES), f.wasmParts),
          f.worker
            ? cachedBlobUrl(f.worker, "text/javascript", report("worker", 2_000))
            : undefined,
        ]);
        return { coreURL: core, wasmURL: wasm, workerURL: worker };
      })();
      const ffmpeg = new FFmpeg();
      await ffmpeg.load(await urls);
      useEngine.setState({ status: "ready", fraction: 1, error: null });
      return ffmpeg;
    } catch (err) {
      instance = null;
      urls = null;
      const message =
        err instanceof FriendlyError
          ? err.message
          : "The video engine couldn't start in this browser. Try reloading the page, or another browser.";
      useEngine.setState({ status: "error", error: message });
      throw new FriendlyError(message, { cause: err });
    }
  })();
  return instance;
}

/** Stops the engine (to cancel a job). The next job restarts it from the cached files. */
async function restartEngine(): Promise<void> {
  const current = instance;
  instance = null;
  try {
    (await current)?.terminate();
  } catch {
    // It failed to load anyway.
  }
}

export interface FfmpegRun {
  /** Input files, available to ffmpeg (read straight from disk) as `inputs[i]`. */
  inputs: File[];
  /** The ffmpeg arguments. Write outputs into `/out/`. */
  args: (inputs: string[]) => string[];
  /** Seconds of output, for progress. Defaults to the first input's duration from the log. */
  duration?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface FfmpegOutput {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

/** Jobs run one after another: the engine can only do one thing at a time. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs one ffmpeg job and returns every file it wrote to /out/. Input files are mounted rather
 * than copied, so big inputs don't have to fit in memory. Canceling stops the engine at once.
 */
export function runFfmpeg(run: FfmpegRun): Promise<{ outputs: FfmpegOutput[]; log: string[] }> {
  const job = queue.then(() => execute(run));
  queue = job.catch(() => {});
  return job;
}

let jobCounter = 0;

async function execute(run: FfmpegRun): Promise<{ outputs: FfmpegOutput[]; log: string[] }> {
  const { signal, onProgress } = run;
  if (signal?.aborted) throw signal.reason;
  const ffmpeg = await loadEngine();
  const dir = `/job${++jobCounter}`;
  const inDir = `${dir}/in`;
  const outDir = "/out";
  const log: string[] = [];
  let duration = run.duration ?? null;

  const onLog = ({ message }: { message: string }) => {
    log.push(message);
    if (log.length > 400) log.splice(0, 100);
    if (duration === null) duration = parseDurationLine(message);
    const time = parseProgressTime(message);
    if (time !== null && duration) onProgress?.(Math.min(1, Math.max(0, time / duration)));
  };
  const onAbort = () => void restartEngine();

  ffmpeg.on("log", onLog);
  signal?.addEventListener("abort", onAbort);
  let mounted = false;
  try {
    await ffmpeg.createDir(dir);
    await ffmpeg.createDir(inDir);
    await ffmpeg.createDir(outDir).catch(() => {});
    const names = run.inputs.map((f, i) => `${i}.${extension(f.name) || "bin"}`);
    await ffmpeg.mount(
      FFFSType.WORKERFS,
      { blobs: run.inputs.map((f, i) => ({ name: names[i]!, data: f })) },
      inDir,
    );
    mounted = true;

    const args = limitThreads(run.args(names.map((n) => `${inDir}/${n}`)));
    const code = await ffmpeg.exec(["-hide_banner", "-nostdin", ...args]);
    if (signal?.aborted) throw signal.reason;
    if (code !== 0) throw new FfmpegError(explainFailure(log), log);

    const outputs: FfmpegOutput[] = [];
    for (const node of await ffmpeg.listDir(outDir)) {
      if (node.isDir) continue;
      const path = `${outDir}/${node.name}`;
      const data = await ffmpeg.readFile(path);
      await ffmpeg.deleteFile(path);
      if (typeof data !== "string")
        outputs.push({ name: node.name, data: data as Uint8Array<ArrayBuffer> });
    }
    if (!outputs.length) throw new FfmpegError(explainFailure(log), log);
    onProgress?.(1);
    return { outputs, log };
  } catch (err) {
    if (signal?.aborted) throw signal.reason;
    if (err instanceof FriendlyError) throw err;
    // The engine itself broke (often out of memory): start fresh next time.
    void restartEngine();
    throw new FfmpegError(explainFailure([...log, String(err)]), log, err);
  } finally {
    ffmpeg.off("log", onLog);
    signal?.removeEventListener("abort", onAbort);
    if (!signal?.aborted && instance) {
      // Leave the file system clean for the next job; ignore errors if the engine was restarted.
      try {
        for (const node of await ffmpeg.listDir(outDir)) {
          if (!node.isDir) await ffmpeg.deleteFile(`${outDir}/${node.name}`);
        }
        if (mounted) await ffmpeg.unmount(inDir);
        await ffmpeg.deleteDir(inDir);
        await ffmpeg.deleteDir(dir);
      } catch {
        // Not worth failing a finished job over.
      }
    }
  }
}

/** An ffmpeg failure, explained in plain words, with the log kept for the console. */
export class FfmpegError extends FriendlyError {
  constructor(
    message: string,
    readonly log: string[],
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "FfmpegError";
    console.warn("ffmpeg log:\n" + log.slice(-40).join("\n"));
  }
}

/** Runs ffmpeg with no output file, just to read what it prints. */
async function printOut(args: string[], inputs: File[] = []): Promise<string[]> {
  const ffmpeg = await loadEngine();
  const job = queue.then(async () => {
    const log: string[] = [];
    const onLog = ({ message }: { message: string }) => void log.push(message);
    ffmpeg.on("log", onLog);
    const dir = `/job${++jobCounter}`;
    try {
      if (inputs.length) {
        await ffmpeg.createDir(dir);
        await ffmpeg.mount(
          FFFSType.WORKERFS,
          {
            blobs: inputs.map((f, i) => ({ name: `${i}.${extension(f.name) || "bin"}`, data: f })),
          },
          dir,
        );
      }
      await ffmpeg.exec(["-hide_banner", ...args.map((a) => a.replace("{dir}", dir))]);
      return log;
    } finally {
      ffmpeg.off("log", onLog);
      if (inputs.length) {
        await ffmpeg.unmount(dir).catch(() => {});
        await ffmpeg.deleteDir(dir).catch(() => {});
      }
    }
  });
  queue = job.catch(() => {});
  return job;
}

/** What ffmpeg prints about a file (`ffmpeg -i`), for reading formats the browser can't. */
export async function ffmpegDescribe(file: File): Promise<string[]> {
  return printOut(["-i", `{dir}/0.${extension(file.name) || "bin"}`], [file]);
}

export interface EngineSupport {
  muxers: Set<string>;
  encoders: Set<string>;
}

const SUPPORT_KEY = `everything-mp4:ffmpeg-support:${__FFMPEG_VERSION__}`;

/** What the engine can make, if it has been checked before (it's remembered across visits). */
export function knownSupport(): EngineSupport | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SUPPORT_KEY) ?? "null") as {
      muxers: string[];
      encoders: string[];
    } | null;
    return saved ? { muxers: new Set(saved.muxers), encoders: new Set(saved.encoders) } : null;
  } catch {
    return null;
  }
}

let supportCheck: Promise<EngineSupport> | null = null;

/** Asks the engine once which formats and codecs it can make; the answer is remembered. */
export function engineSupport(): Promise<EngineSupport> {
  supportCheck ??= (async () => {
    const known = knownSupport();
    if (known) return known;
    const muxers = parseListing(await printOut(["-muxers"]), "muxers");
    const encoders = parseListing(await printOut(["-encoders"]), "encoders");
    try {
      localStorage.setItem(
        SUPPORT_KEY,
        JSON.stringify({ muxers: [...muxers], encoders: [...encoders] }),
      );
    } catch {
      // Not remembered; it's checked again next visit.
    }
    return { muxers, encoders };
  })().catch((err: unknown) => {
    supportCheck = null;
    throw err;
  });
  return supportCheck;
}
