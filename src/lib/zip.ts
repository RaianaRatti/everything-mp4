import { makeZip } from "client-zip";
import { downloadBlob, uniqueNames } from "./files";
import { canSaveToDisk, pickSaveFile } from "./output";

export interface NamedBlob {
  name: string;
  blob: Blob;
}

function entries(files: readonly NamedBlob[]) {
  const names = uniqueNames(files.map((f) => f.name));
  // Files are stored as they are (no compression): video and images are already compressed.
  return files.map((f, i) => ({ name: names[i]!, input: f.blob, lastModified: new Date() }));
}

/** Packs files into one ZIP. The browser keeps big blobs on disk, so this works for large sets. */
export async function zipBlob(files: readonly NamedBlob[]): Promise<Blob> {
  const stream = makeZip(entries(files));
  return new Response(stream, { headers: { "Content-Type": "application/zip" } }).blob();
}

/**
 * Saves files as a ZIP. Where the browser allows, it asks where to save and streams the ZIP
 * straight into that file; otherwise it builds the ZIP and downloads it. Must be called from a click.
 */
export async function saveZip(files: readonly NamedBlob[], name: string): Promise<void> {
  if (canSaveToDisk()) {
    let handle: FileSystemFileHandle;
    try {
      handle = await pickSaveFile(name, "application/zip");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      throw err;
    }
    const writable = await handle.createWritable();
    await makeZip(entries(files)).pipeTo(writable);
    return;
  }
  downloadBlob(await zipBlob(files), name);
}
