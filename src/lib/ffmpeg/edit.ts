import type { MediaFile } from "../mediaFiles";
import { baseName, extension } from "../files";
import { runFfmpeg } from "./engine";

/** Re-encodes to an H.264/AAC MP4 that plays almost everywhere. */
export const ENCODE_MP4 = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-movflags",
  "+faststart",
];

/** Encoders need even sizes for 4:2:0 video. */
export function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

export interface Span {
  start: number;
  end: number;
}

/** The parts of [0, duration] not covered by `spans`. */
export function invertSpans(spans: Span[], duration: number): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let at = 0;
  for (const s of sorted) {
    if (s.start > at + 0.05) out.push({ start: at, end: s.start });
    at = Math.max(at, s.end);
  }
  if (duration > at + 0.05) out.push({ start: at, end: duration });
  return out;
}

/** atempo only takes 0.5–2 per instance, so bigger changes are chained. */
export function atempoChain(factor: number): string {
  const parts: number[] = [];
  let f = factor;
  while (f > 2) {
    parts.push(2);
    f /= 2;
  }
  while (f < 0.5) {
    parts.push(0.5);
    f /= 0.5;
  }
  parts.push(f);
  return parts.map((p) => `atempo=${p.toFixed(4)}`).join(",");
}

export type FitMode = "blur" | "bars" | "crop" | "stretch";

/**
 * A filter graph piece that fits `[inLabel]` into w×h and writes `[outLabel]`. `position` (0–1)
 * picks which part survives a crop; `color` fills the bars.
 */
export function fitGraph(
  inLabel: string,
  outLabel: string,
  w: number,
  h: number,
  mode: FitMode,
  { color = "black", position = 0.5 }: { color?: string; position?: number } = {},
): string {
  const tag = outLabel.replace(/\W/g, "");
  switch (mode) {
    case "bars":
      return `[${inLabel}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1[${outLabel}]`;
    case "crop":
      return `[${inLabel}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${position}:(ih-oh)*${position},setsar=1[${outLabel}]`;
    case "stretch":
      return `[${inLabel}]scale=${w}:${h},setsar=1[${outLabel}]`;
    case "blur":
      return (
        `[${inLabel}]split[${tag}a][${tag}b];` +
        `[${tag}a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:2[${tag}bg];` +
        `[${tag}b]scale=${w}:${h}:force_original_aspect_ratio=decrease[${tag}fg];` +
        `[${tag}bg][${tag}fg]overlay=(W-w)/2:(H-h)/2,setsar=1[${outLabel}]`
      );
  }
}

/** A name ffmpeg can use as an output pattern (`%` would be read as a number placeholder). */
export function safeBase(file: File): string {
  return baseName(file.name).replace(/[%/\\]/g, "_");
}

/** The file's own extension, for lossless copies into the same kind of container. */
export function sameExtension(media: MediaFile): string {
  return media.info.realExtension ?? (extension(media.file.name) || "mp4");
}

/** Mime type for a container extension, close enough for downloads and previews. */
export function mimeFor(ext: string): string {
  if (ext === "webm") return "video/webm";
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/** Finds scene changes, returning the times (seconds) where a new shot starts. */
export async function detectScenes(
  file: File,
  threshold: number,
  duration: number,
  signal: AbortSignal,
  onProgress: (f: number) => void,
): Promise<number[]> {
  const { outputs } = await runFfmpeg({
    inputs: [file],
    duration,
    signal,
    onProgress,
    // A small picture is plenty for spotting cuts, and much faster.
    args: ([input]) => [
      "-i",
      input!,
      "-an",
      "-vf",
      `scale=160:-2,select='gt(scene,${threshold})',metadata=print:file=/out/scenes.txt`,
      "-f",
      "null",
      "-",
    ],
  });
  const out = outputs[0] ? text(outputs[0].data) : "";
  return [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Looks for black bars and returns the picture inside them. */
export async function detectCrop(
  file: File,
  duration: number,
  signal: AbortSignal,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const { outputs } = await runFfmpeg({
    inputs: [file],
    duration: Math.min(10, duration),
    signal,
    // Skip the start, which is often a black fade-in.
    args: ([input]) => [
      "-ss",
      String(Math.min(duration * 0.2, 30)),
      "-i",
      input!,
      "-t",
      "10",
      "-an",
      "-vf",
      "cropdetect=24:2:0,metadata=print:file=/out/crop.txt",
      "-f",
      "null",
      "-",
    ],
  });
  const out = outputs[0] ? text(outputs[0].data) : "";
  const last = (key: string) => {
    const all = [...out.matchAll(new RegExp(`lavfi\\.cropdetect\\.${key}=(\\d+)`, "g"))];
    return all.length ? Number(all[all.length - 1]![1]) : null;
  };
  const [x, y, width, height] = ["x", "y", "w", "h"].map(last);
  if (x == null || y == null || !width || !height) return null;
  return { x, y, width, height };
}

/** `enable` value for a filter that should only act between two times. */
export function between(start: number, end: number): string {
  return `'between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
}

/** An ffmpeg expression that moves linearly through `keys` (time → value), holding at the ends. */
export function lerpExpr(keys: { t: number; v: number }[]): string {
  const k = [...keys].sort((a, b) => a.t - b.t);
  if (k.length === 1) return String(Math.round(k[0]!.v));
  let expr = String(Math.round(k[k.length - 1]!.v));
  for (let i = k.length - 2; i >= 0; i--) {
    const a = k[i]!;
    const b = k[i + 1]!;
    const span = Math.max(b.t - a.t, 0.001);
    expr = `if(lt(t,${b.t.toFixed(3)}),${a.v}+(${b.v - a.v})*(t-${a.t.toFixed(3)})/${span.toFixed(3)},${expr})`;
  }
  return `if(lt(t,${k[0]!.t.toFixed(3)}),${k[0]!.v},${expr})`;
}

/** The audio codec that fits a container when the video is copied as it is. */
export function audioCodecFor(ext: string): string[] {
  return ext === "webm" ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "192k"];
}

export interface Piece extends Span {
  /** Speed factor for this piece: 1 keeps it, 4 plays it four times as fast. */
  f: number;
}

/**
 * A filter graph that plays the pieces one after another (each at its own speed) and writes
 * `[v]` and/or `[a]`. Tiny audio fades at each join avoid clicks.
 */
export function piecesGraph(
  pieces: Piece[],
  { video, audio, fps }: { video: boolean; audio: boolean; fps: number },
): string {
  const n = pieces.length;
  const labels = (p: string) => pieces.map((_, i) => `[${p}${i}]`).join("");
  const out: string[] = [];
  if (video) {
    out.push(`[0:v]split=${n}${labels("s")}`);
    pieces.forEach((p, i) =>
      out.push(
        `[s${i}]trim=${p.start}:${p.end},setpts=(PTS-STARTPTS)/${p.f},fps=${fps}[v${i}]`,
      ),
    );
  }
  if (audio) {
    out.push(`[0:a]asplit=${n}${labels("t")}`);
    pieces.forEach((p, i) => {
      const len = (p.end - p.start) / p.f;
      const fade = Math.min(0.01, len / 4);
      out.push(
        `[t${i}]atrim=${p.start}:${p.end},asetpts=PTS-STARTPTS` +
          (p.f === 1 ? "" : `,${atempoChain(p.f)}`) +
          `,afade=in:d=${fade},afade=out:st=${Math.max(0, len - fade).toFixed(3)}:d=${fade}[a${i}]`,
      );
    });
  }
  const ins = pieces.map((_, i) => `${video ? `[v${i}]` : ""}${audio ? `[a${i}]` : ""}`).join("");
  out.push(
    `${ins}concat=n=${n}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? "[v]" : ""}${audio ? "[a]" : ""}`,
  );
  return out.join(";");
}

/** Reads `key=value` lines that ffmpeg's metadata/ametadata filters print to a file. */
export function metadataValues(data: Uint8Array | undefined, key: string): number[] {
  const out = data ? new TextDecoder().decode(data) : "";
  return [...out.matchAll(new RegExp(`${key.replace(/\./g, "\\.")}=(-?[\\d.]+)`, "g"))].map((m) =>
    Number(m[1]),
  );
}
