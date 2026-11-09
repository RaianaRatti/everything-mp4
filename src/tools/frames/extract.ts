import { CanvasSink, EncodedPacketSink } from "mediabunny";
import { openVideo } from "../../lib/engine/pipeline";
import type { MediaInfo } from "../../lib/engine/inspect";
import { FriendlyError } from "../../lib/errors";
import { baseName, formatBytes } from "../../lib/files";
import { IMAGE_EXT, canvasToBlob, type ImageType } from "../../lib/gfx/canvas";
import { formatTime } from "../../lib/time";

export type ManyMode =
  | { kind: "every"; seconds: number }
  | { kind: "count"; count: number }
  | { kind: "keyframes" }
  | { kind: "all"; start: number; end: number };

/** Most frames one extraction may produce, so a slip of the finger doesn't make 50,000 files. */
export const MAX_FRAMES = 3000;

/** The times (in seconds) to take frames at. Keyframes are found separately, from the file. */
export function frameTimes(mode: ManyMode, duration: number, fps: number): number[] {
  const times: number[] = [];
  if (mode.kind === "every") {
    const step = Math.max(0.04, mode.seconds);
    for (let t = 0; t < duration - 1e-6 && times.length < MAX_FRAMES; t += step) times.push(t);
  } else if (mode.kind === "count") {
    const n = Math.min(MAX_FRAMES, Math.max(1, Math.round(mode.count)));
    // Evenly spread, each in the middle of its slice, so the first isn't a black opening frame.
    for (let i = 0; i < n; i++) times.push(((i + 0.5) * duration) / n);
  } else if (mode.kind === "all") {
    const step = 1 / Math.max(1, fps);
    for (let t = mode.start; t < mode.end - 1e-6 && times.length < MAX_FRAMES; t += step)
      times.push(t);
  }
  return times;
}

/** "0m12.50s", used in file names so they sort by time. */
export function timeLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}m${(seconds - m * 60).toFixed(2).padStart(5, "0")}s`;
}

export interface ExtractOptions {
  file: File;
  info: MediaInfo;
  mode: ManyMode;
  type: ImageType;
  /** Output width in pixels; null keeps the original. */
  width: number | null;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

/** Pulls frames out of a video as image files, named by number and time. */
export async function extractFrames(o: ExtractOptions): Promise<{ name: string; blob: Blob }[]> {
  const { input, track } = await openVideo(o.file);
  try {
    const offset = await track.getFirstTimestamp();
    let times: number[];
    if (o.mode.kind === "keyframes") {
      times = [];
      const packets = new EncodedPacketSink(track);
      let packet = await packets.getFirstKeyPacket({ metadataOnly: true });
      while (packet && times.length < MAX_FRAMES) {
        if (o.signal.aborted) throw o.signal.reason;
        times.push(packet.timestamp - offset);
        packet = await packets.getNextKeyPacket(packet, { metadataOnly: true });
      }
      times.sort((a, b) => a - b);
    } else {
      times = frameTimes(o.mode, o.info.duration, o.info.video[0]?.fps ?? 30);
    }
    if (!times.length) throw new FriendlyError("There are no frames to save with these settings.");

    const sink = new CanvasSink(track, { width: o.width ?? undefined, poolSize: 2 });
    const base = baseName(o.file.name);
    const ext = IMAGE_EXT[o.type];
    const digits = String(times.length).length;
    const out: { name: string; blob: Blob }[] = [];
    let i = 0;
    // A hair past each time, so rounding never picks the previous frame.
    for await (const frame of sink.canvasesAtTimestamps(times.map((t) => offset + t + 1e-4))) {
      if (o.signal.aborted) throw o.signal.reason;
      const t = times[i]!;
      i++;
      if (!frame) continue;
      const number = String(i).padStart(Math.max(4, digits), "0");
      out.push({
        name: `${base}-${number}-${timeLabel(t)}.${ext}`,
        blob: await canvasToBlob(frame.canvas, o.type),
      });
      o.onProgress(i / times.length);
    }
    return out;
  } finally {
    input.dispose();
  }
}

export interface SheetOptions {
  file: File;
  info: MediaInfo;
  columns: number;
  rows: number;
  /** Width of the whole sheet in pixels. */
  width: number;
  type: ImageType;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

/** A grid of evenly spaced thumbnails with timestamps, under a header with the file's details. */
export async function contactSheet(o: SheetOptions): Promise<Blob> {
  const { input, track } = await openVideo(o.file);
  try {
    const video = o.info.video[0]!;
    const gap = Math.round(o.width / 160) + 4;
    const header = Math.round(o.width / 22) + 40;
    const cellW = Math.floor((o.width - gap * (o.columns + 1)) / o.columns);
    const cellH = Math.round((cellW * video.height) / video.width);
    const height = header + o.rows * (cellH + gap) + gap;

    const canvas = new OffscreenCanvas(o.width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, o.width, height);

    // Header: the file name and its details.
    const big = Math.max(14, Math.round(o.width / 55));
    ctx.fillStyle = "#1c1b1a";
    ctx.font = `600 ${big}px "Pixelify Sans", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(o.file.name, gap, gap, o.width - gap * 2);
    ctx.font = `400 ${Math.round(big * 0.75)}px "Pixelify Sans", system-ui, sans-serif`;
    ctx.fillStyle = "#45423e";
    const details = [
      formatBytes(o.info.size),
      formatTime(o.info.duration, 0),
      `${video.width}×${video.height}`,
      video.fps ? `${video.fps} fps` : null,
      video.codec,
      o.info.audio[0] ? `${o.info.audio[0].codec} sound` : "no sound",
    ].filter(Boolean);
    ctx.fillText(details.join(" · "), gap, gap + big * 1.4, o.width - gap * 2);

    const count = o.columns * o.rows;
    const times = frameTimes({ kind: "count", count }, o.info.duration, video.fps ?? 30);
    const offset = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, {
      width: cellW,
      height: cellH,
      fit: "contain",
      poolSize: 2,
    });
    const label = Math.max(10, Math.round(cellW / 14));
    let i = 0;
    for await (const frame of sink.canvasesAtTimestamps(times.map((t) => offset + t))) {
      if (o.signal.aborted) throw o.signal.reason;
      const x = gap + (i % o.columns) * (cellW + gap);
      const y = header + Math.floor(i / o.columns) * (cellH + gap);
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, cellW, cellH);
      if (frame) ctx.drawImage(frame.canvas, x, y, cellW, cellH);
      // Timestamp in the corner, on a dark tab so it reads on any picture.
      const text = formatTime(times[i]!, 0);
      ctx.font = `400 ${label}px "Pixelify Sans", system-ui, sans-serif`;
      const w = ctx.measureText(text).width + label * 0.8;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x + cellW - w, y + cellH - label * 1.5, w, label * 1.5);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + cellW - w + label * 0.4, y + cellH - label * 1.25);
      i++;
      o.onProgress(i / count);
    }
    return canvasToBlob(canvas, o.type, 0.9);
  } finally {
    input.dispose();
  }
}
