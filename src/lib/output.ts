import { BufferTarget, StreamTarget, type Target } from "mediabunny";
import { extension } from "./files";

/** Outputs bigger than this are written straight to disk (where the browser can) instead of memory. */
export const BIG_OUTPUT = 1024 ** 3;

/** Where a job writes its result: kept in memory, or streamed into a file the person picked. */
export type OutputTarget = { kind: "memory" } | { kind: "disk"; handle: FileSystemFileHandle };

export const MEMORY: OutputTarget = { kind: "memory" };

export function canSaveToDisk(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

/** Asks where to save a file. Must be called from a click. */
export async function pickSaveFile(name: string, mimeType: string): Promise<FileSystemFileHandle> {
  const ext = extension(name);
  return window.showSaveFilePicker!({
    suggestedName: name,
    types: ext
      ? [{ accept: { [mimeType || "application/octet-stream"]: [`.${ext}`] } }]
      : undefined,
  });
}

/**
 * A mediabunny target for an output. `finish` (after the output is finalized) returns the result as
 * a Blob; for disk targets that's the saved file, which the browser reads from disk on demand.
 */
export async function mediabunnyTarget(
  output: OutputTarget,
  mimeType: string,
): Promise<{ target: Target; finish: () => Promise<Blob>; abort: () => Promise<void> }> {
  if (output.kind === "memory") {
    const target = new BufferTarget();
    return {
      target,
      finish: async () => new Blob([target.buffer!], { type: mimeType }),
      abort: async () => {},
    };
  }
  const writable = await output.handle.createWritable();
  return {
    // Chunked, so a big file goes to disk in a few large writes instead of many tiny ones.
    target: new StreamTarget(writable, { chunked: true }),
    finish: () => output.handle.getFile(),
    abort: () => writable.abort().catch(() => {}),
  };
}

/** Writes finished bytes to the target (for engines that produce the whole file at once). */
export async function writeBytes(
  output: OutputTarget,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<Blob> {
  if (output.kind === "memory") return new Blob([bytes], { type: mimeType });
  const writable = await output.handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return output.handle.getFile();
}
