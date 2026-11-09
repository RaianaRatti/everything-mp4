export type FileKind = "video" | "audio" | "image" | "subtitle";

/** File extensions we recognize, by kind. Used when the browser gives no (or a vague) MIME type. */
// prettier-ignore
export const EXTENSIONS: Record<FileKind, readonly string[]> = {
  video: [
    "mp4", "m4v", "mov", "qt", "webm", "mkv", "avi", "wmv", "asf", "flv", "f4v", "mpg", "mpeg",
    "m2v", "vob", "ts", "mts", "m2ts", "3gp", "3g2", "ogv", "mxf", "dv", "divx", "y4m",
  ],
  audio: [
    "mp3", "m4a", "m4r", "m4b", "aac", "wav", "flac", "ogg", "oga", "opus", "aif", "aiff", "wma",
    "amr", "ac3", "eac3", "caf", "weba", "mka", "alac",
  ],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg"],
  subtitle: ["srt", "vtt", "ass", "ssa", "sbv", "ttml", "dfxp", "sub"],
};

const KIND_NAMES: Record<FileKind, string> = {
  video: "video",
  audio: "audio file",
  image: "image",
  subtitle: "subtitle file",
};

/** "holiday.MOV" → "mov"; "" when there's no extension. */
export function extension(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

/** "holiday.final.mov" → "holiday.final". */
export function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, "") || "file";
}

/** `<input name>-<suffix>.<ext>`, e.g. outputName("holiday.mov", "trimmed", "mp4") → "holiday-trimmed.mp4". */
export function outputName(inputName: string, suffix: string, ext: string): string {
  return `${baseName(inputName)}${suffix ? `-${suffix}` : ""}.${ext.replace(/^\./, "")}`;
}

/** Makes names unique by adding " (2)", " (3)"… before the extension, e.g. for files in one ZIP. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const ext = extension(name);
    return `${baseName(name)} (${count})${ext ? `.${ext}` : ""}`;
  });
}

/**
 * What kind of file this is, from its MIME type or else its extension. Extensions win over the vague
 * MIME types some systems report (e.g. "application/octet-stream" or "video/x-matroska" for audio).
 */
export function fileKind(file: { name: string; type: string }): FileKind | null {
  const ext = extension(file.name);
  for (const kind of ["subtitle", "audio", "image", "video"] as const) {
    if (EXTENSIONS[kind].includes(ext)) {
      // .ogg/.webm can hold video too; trust a MIME type that says so.
      if (kind === "audio" && file.type.startsWith("video/")) return "video";
      return kind;
    }
  }
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "text/vtt" || file.type === "application/x-subrip") return "subtitle";
  return null;
}

/** An `accept` attribute for a file input that takes these kinds of files. */
export function acceptFor(kinds: readonly FileKind[]): string {
  const mimes = kinds.filter((k) => k !== "subtitle").map((k) => `${k}/*`);
  const exts = kinds.flatMap((k) => EXTENSIONS[k].map((e) => `.${e}`));
  return [...mimes, ...exts].join(",");
}

/** "video", "video or audio file", "video, audio file or image". */
export function describeKinds(kinds: readonly FileKind[]): string {
  const names = kinds.map((k) => KIND_NAMES[k]);
  if (names.length <= 1) return names[0] ?? "file";
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** "128 kb/s", "4.5 Mb/s". */
export function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} b/s`;
  if (bitsPerSecond < 1_000_000) return `${Math.round(bitsPerSecond / 1000)} kb/s`;
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mb/s`;
}

/** Saves a blob through the browser's normal download. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Give the download a moment to start before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
