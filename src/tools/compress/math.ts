import { scaleToShortSide } from "../../lib/engine/estimate";
import type { Size } from "../../lib/layout";
import { formatBytes } from "../../lib/files";

export type CompressMode =
  | { kind: "size"; bytes: number }
  | { kind: "quality"; level: number }
  | { kind: "percent"; percent: number };

export interface CompressSource {
  duration: number;
  size: Size;
  fps: number;
  bytes: number;
  hasAudio: boolean;
  /** The source video's bitrate, if known; there's no point going above it. */
  videoBitrate: number | null;
}

export interface CompressPlan {
  videoBitrate: number;
  /** 0 when the sound is dropped. */
  audioBitrate: number;
  size: Size;
  fps: number;
  /** The size we aim for, for the retry check; null for quality mode. */
  targetBytes: number | null;
  /** Plain explanations of what had to give ("made smaller: 720p"). */
  notes: string[];
  /** Set when the target can't be reached at all. */
  impossible: string | null;
}

/** Below this many bits per pixel per frame, H.264 turns to mush; lower the resolution instead. */
const MIN_BPP = 0.035;
/** Container overhead to leave room for. */
const OVERHEAD = 0.97;
const RESOLUTION_STEPS = [1080, 720, 540, 480, 360, 240];
const AUDIO_STEPS = [128_000, 96_000, 64_000, 48_000];

function bpp(bits: number, size: Size, fps: number): number {
  return bits / (size.width * size.height * fps);
}

/** The bytes the "percent smaller" and "target size" modes aim for. */
export function targetBytes(source: CompressSource, mode: CompressMode): number | null {
  if (mode.kind === "size") return mode.bytes;
  if (mode.kind === "percent") return source.bytes * (1 - mode.percent / 100);
  return null;
}

/**
 * Works out the bitrate for a compression. For a target size, the bitrate comes from the size
 * and length; when that's too little for a sharp picture, it lowers the resolution, then the
 * frame rate, then the sound quality, and says so.
 */
export function planCompression(
  source: CompressSource,
  mode: CompressMode,
  maxShortSide: number | null = null,
): CompressPlan {
  const notes: string[] = [];
  let size = scaleToShortSide(source.size, maxShortSide);
  let fps = Math.min(60, source.fps || 30);
  const duration = Math.max(0.1, source.duration);
  const target = targetBytes(source, mode);

  if (target === null) {
    // Quality mode: 1 is tiny and rough, 100 is close to the original.
    const level = Math.min(100, Math.max(1, mode.kind === "quality" ? mode.level : 50));
    const audioBitrate = source.hasAudio
      ? level < 30
        ? 64_000
        : level < 70
          ? 96_000
          : 128_000
      : 0;
    let videoBitrate = Math.round(size.width * size.height * fps * (0.015 + (level / 100) * 0.12));
    if (source.videoBitrate)
      videoBitrate = Math.min(videoBitrate, Math.round(source.videoBitrate * 0.9));
    return {
      videoBitrate: Math.max(50_000, videoBitrate),
      audioBitrate,
      size,
      fps,
      targetBytes: null,
      notes,
      impossible: null,
    };
  }

  const totalBits = (target * 8 * OVERHEAD) / duration;
  let audioBitrate = source.hasAudio ? AUDIO_STEPS[0]! : 0;
  // Sound shouldn't take more than a fifth of the budget.
  while (source.hasAudio && audioBitrate > AUDIO_STEPS.at(-1)! && audioBitrate > totalBits / 5) {
    audioBitrate = AUDIO_STEPS[AUDIO_STEPS.indexOf(audioBitrate) + 1]!;
  }
  let videoBitrate = totalBits - audioBitrate;

  if (bpp(videoBitrate, size, fps) < MIN_BPP) {
    const short = Math.min(size.width, size.height);
    for (const step of RESOLUTION_STEPS.filter((s) => s < short)) {
      size = scaleToShortSide(source.size, step);
      if (bpp(videoBitrate, size, fps) >= MIN_BPP) break;
    }
    if (Math.min(size.width, size.height) < short) {
      notes.push(`To fit, the picture is made smaller (${Math.min(size.width, size.height)}p).`);
    }
  }
  if (bpp(videoBitrate, size, fps) < MIN_BPP && fps > 24) {
    fps = 24;
    notes.push("To fit, the frame rate is lowered to 24 fps.");
  }
  if (bpp(videoBitrate, size, fps) < MIN_BPP && fps > 15) {
    fps = 15;
    notes.push("To fit, the frame rate is lowered to 15 fps, so motion looks choppier.");
  }
  if (source.hasAudio && audioBitrate < AUDIO_STEPS[0]!) {
    notes.push(
      `The sound quality is lowered to ${audioBitrate / 1000} kb/s to leave room for the picture.`,
    );
  }

  const impossible =
    videoBitrate < 40_000
      ? `${formatBytes(target)} is too small for a video this long. Pick a bigger size, or trim the video first.`
      : null;
  if (source.videoBitrate && videoBitrate > source.videoBitrate) {
    videoBitrate = source.videoBitrate;
    notes.push("The video is already about this size or smaller, so it won't shrink much.");
  }
  if (bpp(videoBitrate, size, fps) < MIN_BPP && !impossible) {
    notes.push("This is a big squeeze: expect a blurry picture.");
  }
  return {
    videoBitrate: Math.round(Math.max(40_000, videoBitrate)),
    audioBitrate,
    size,
    fps,
    targetBytes: target,
    notes,
    impossible,
  };
}

/**
 * The bitrate for another try when a result came out too big: scaled by how far off it was,
 * with a little extra margin. Null when it's close enough (within 3%).
 */
export function retryBitrate(videoBitrate: number, target: number, actual: number): number | null {
  if (actual <= target * 1.03) return null;
  return Math.round(videoBitrate * (target / actual) * 0.93);
}
