import type { Size } from "../layout";
import { even } from "../layout";
import type { AudioCodecId, VideoCodecId } from "./formats";

export type QualityChoice = "smaller" | "balanced" | "high";

/** Bits per pixel per frame for H.264 at each quality; other codecs scale from this. */
const H264_BPP: Record<QualityChoice, number> = { smaller: 0.05, balanced: 0.08, high: 0.13 };

/** How many bits each codec needs compared with H.264 for similar quality. */
const CODEC_FACTOR: Partial<Record<VideoCodecId, number>> = {
  hevc: 0.65,
  av1: 0.55,
  vp9: 0.65,
  vp8: 1.1,
  mpeg4: 1.6,
  flv1: 1.8,
  h263: 1.8,
  wmv2: 1.6,
  theora: 1.4,
  mpeg2: 2.2,
  mpeg1: 2.8,
};

/** Codecs with a (near) fixed data rate, in bits per pixel per frame, whatever the quality. */
const FIXED_BPP: Partial<Record<VideoCodecId, number>> = { prores: 3.5, dnxhr: 3.5, ffv1: 5 };

/** A sensible video bitrate (bits per second) for a codec, size, frame rate and quality. */
export function videoBitrate(
  codec: VideoCodecId,
  size: Size,
  fps: number,
  quality: QualityChoice,
): number {
  const pixels = size.width * size.height * fps;
  const fixed = FIXED_BPP[codec];
  if (fixed) return Math.round(pixels * fixed);
  const bpp = H264_BPP[quality] * (CODEC_FACTOR[codec] ?? 1);
  // Small videos need relatively more bits per pixel to look decent.
  const smallBoost = size.width * size.height < 640 * 360 ? 1.5 : 1;
  return Math.max(150_000, Math.round(pixels * bpp * smallBoost));
}

/** Audio bitrate (bits per second) for a codec and quality, at 48 kHz stereo unless given. */
export function audioBitrate(
  codec: AudioCodecId,
  quality: QualityChoice,
  sampleRate = 48_000,
  channels = 2,
): number {
  const lossless = sampleRate * channels * 16;
  switch (codec) {
    case "pcm":
    case "pcmbe":
      return lossless;
    case "flac":
    case "alac":
      return Math.round(lossless * 0.6);
    case "opus":
      return { smaller: 64_000, balanced: 96_000, high: 160_000 }[quality];
    case "mp2":
    case "ac3":
      return { smaller: 160_000, balanced: 192_000, high: 256_000 }[quality];
    default:
      return { smaller: 96_000, balanced: 128_000, high: 192_000 }[quality];
  }
}

/** Expected file size in bytes for a total bitrate and length, with a little container overhead. */
export function sizeFor(bitsPerSecond: number, seconds: number): number {
  return (bitsPerSecond * seconds * 1.02) / 8;
}

/**
 * The output size for a resolution choice given as the short side (720 for 720p), keeping the
 * aspect ratio and never enlarging. Dimensions are even, which most encoders need.
 */
export function scaleToShortSide(source: Size, shortSide: number | null): Size {
  const short = Math.min(source.width, source.height);
  if (!shortSide || short <= shortSide) {
    return { width: even(source.width), height: even(source.height) };
  }
  const scale = shortSide / short;
  return {
    width: even(Math.round(source.width * scale)),
    height: even(Math.round(source.height * scale)),
  };
}
