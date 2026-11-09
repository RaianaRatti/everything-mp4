import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  ffmpegMuxer,
  type AudioCodecId,
  type ContainerId,
  type VideoCodecId,
} from "../engine/formats";
import type { Size } from "../layout";

export interface FfmpegConvert {
  input: string;
  output: string;
  container: ContainerId;
  video: {
    codec: VideoCodecId;
    copy: boolean;
    bitrate?: number;
    size?: Size;
    fps?: number;
    /**
     * Make it play on a DVD player: standard size, frame rate and bitrate. `size` is then the
     * source's size, used to pick 16:9 or 4:3.
     */
    dvd?: "pal" | "ntsc";
  } | null;
  audio: {
    codec: AudioCodecId;
    copy: boolean;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    /** 1-based audio track. */
    track?: number;
  } | null;
  /** Part to keep, in seconds. */
  trim?: { start: number; end: number };
  tags?: Record<string, string>;
}

const k = (bits: number) => `${Math.max(8, Math.round(bits / 1000))}k`;

/** Frame rates MPEG-1/2 allow; anything else is snapped to the nearest one. */
const MPEG_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

function nearest(rates: number[], fps: number): number {
  return rates.reduce((best, r) => (Math.abs(r - fps) < Math.abs(best - fps) ? r : best));
}

/** Encoder settings for a video codec: chosen to be fast in the browser and widely playable. */
export function videoCodecArgs(
  codec: VideoCodecId,
  bitrate: number | undefined,
  container: ContainerId,
): string[] {
  const ff = VIDEO_CODECS[codec].ff;
  if (!ff) throw new Error(`no ffmpeg encoder for ${codec}`);
  const rate = bitrate
    ? ["-b:v", k(bitrate), "-maxrate", k(bitrate * 1.5), "-bufsize", k(bitrate * 2)]
    : [];
  switch (codec) {
    case "h264":
      return ["-c:v", ff, "-preset", "veryfast", "-pix_fmt", "yuv420p", ...rate];
    case "hevc":
      // hvc1 tagging lets Apple devices play it from MP4 and MOV.
      return [
        "-c:v",
        ff,
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        ...(container === "mp4" || container === "mov" ? ["-tag:v", "hvc1"] : []),
        ...rate,
      ];
    case "vp9":
      return [
        "-c:v",
        ff,
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-row-mt",
        "1",
        "-pix_fmt",
        "yuv420p",
        ...rate,
      ];
    case "vp8":
      return ["-c:v", ff, "-deadline", "realtime", "-cpu-used", "8", ...rate];
    case "mpeg4":
      return [
        "-c:v",
        ff,
        ...(container === "avi" ? ["-vtag", "xvid"] : []),
        "-pix_fmt",
        "yuv420p",
        ...rate,
      ];
    case "mpeg2":
    case "mpeg1":
    case "wmv2":
    case "flv1":
    case "h263":
      return ["-c:v", ff, "-pix_fmt", "yuv420p", ...rate];
    case "theora":
      return [
        "-c:v",
        ff,
        "-pix_fmt",
        "yuv420p",
        ...(bitrate ? ["-b:v", k(bitrate)] : ["-q:v", "7"]),
      ];
    case "prores":
      return ["-c:v", ff, "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"];
    case "dnxhr":
      return ["-c:v", ff, "-profile:v", "dnxhr_hq", "-pix_fmt", "yuv422p"];
    case "ffv1":
      return ["-c:v", ff, "-level", "3", "-g", "1", "-slicecrc", "1"];
    case "av1":
      return ["-c:v", ff, ...rate];
  }
}

export function audioCodecArgs(codec: AudioCodecId, bitrate: number | undefined): string[] {
  const ff = AUDIO_CODECS[codec].ff;
  if (!ff) throw new Error(`no ffmpeg encoder for ${codec}`);
  const lossless = codec === "flac" || codec === "pcm" || codec === "pcmbe" || codec === "alac";
  return ["-c:a", ff, ...(bitrate && !lossless ? ["-b:a", k(bitrate)] : [])];
}

/** Sample rates some codecs require. */
function requiredSampleRate(codec: AudioCodecId, asked?: number): number | undefined {
  if (codec === "opus") return 48_000;
  if (codec === "mp2" || codec === "ac3") return asked === 44_100 ? 44_100 : 48_000;
  return asked;
}

/** Full ffmpeg arguments for converting one file. */
export function convertArgs(c: FfmpegConvert): string[] {
  const args: string[] = [];
  if (c.trim) args.push("-ss", c.trim.start.toFixed(3));
  args.push("-i", c.input);
  if (c.trim) args.push("-t", Math.max(0.01, c.trim.end - c.trim.start).toFixed(3));

  // Only the main video and the chosen sound: other streams (subtitles, data) often can't go in
  // the new format. The "?" keeps going if a stream doesn't exist.
  if (c.video) args.push("-map", "0:v:0?");
  if (c.audio) args.push("-map", `0:a:${(c.audio.track ?? 1) - 1}?`);
  args.push("-map_metadata", "0");

  if (c.video) {
    const v = c.video;
    if (v.copy) {
      args.push("-c:v", "copy");
    } else if (v.dvd) {
      const pal = v.dvd === "pal";
      const [w, h] = pal ? [720, 576] : [720, 480];
      // DVDs store 16:9 as a squeezed 720-wide picture that players stretch back out.
      const wide = !!v.size && v.size.width / v.size.height > 1.5;
      args.push(
        "-vf",
        wide
          ? `scale=${w}:${h}`
          : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:-1:-1`,
        "-aspect",
        wide ? "16:9" : "4:3",
        "-r",
        pal ? "25" : "30000/1001",
        "-c:v",
        "mpeg2video",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        "6000k",
        "-maxrate",
        "9000k",
        "-bufsize",
        "1835k",
        "-g",
        pal ? "15" : "18",
      );
    } else {
      const filters: string[] = [];
      if (v.size) filters.push(`scale=${v.size.width}:${v.size.height}`);
      if (v.codec === "h263")
        filters.push("scale=352:288:force_original_aspect_ratio=decrease,pad=352:288:-1:-1");
      if (filters.length) args.push("-vf", filters.join(","));
      if (v.codec === "mpeg2" || v.codec === "mpeg1")
        args.push("-r", String(nearest(MPEG_RATES, v.fps ?? 25)));
      else if (v.fps) args.push("-r", String(v.fps));
      args.push(...videoCodecArgs(v.codec, v.bitrate, c.container));
    }
  } else {
    args.push("-vn");
  }

  if (c.audio) {
    const a = c.audio;
    if (a.copy) {
      args.push("-c:a", "copy");
    } else {
      args.push(...audioCodecArgs(a.codec, a.bitrate));
      const rate = requiredSampleRate(a.codec, a.sampleRate);
      if (rate) args.push("-ar", String(rate));
      if (a.channels) args.push("-ac", String(a.channels));
    }
  } else {
    args.push("-an");
  }

  for (const [key, value] of Object.entries(c.tags ?? {}))
    args.push("-metadata", `${key}=${value}`);
  if (c.container === "mp4" || c.container === "mov" || c.container === "ipod")
    args.push("-movflags", "+faststart");
  if (c.container === "m2ts") args.push("-mpegts_m2ts_mode", "1");
  args.push("-f", ffmpegMuxer(c.container), "-y", c.output);
  return args;
}
