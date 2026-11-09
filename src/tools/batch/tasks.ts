import type { MediaInfo } from "../../lib/engine/inspect";
import { FriendlyError } from "../../lib/errors";
import { ENCODE_MP4, fitGraph } from "../../lib/ffmpeg/edit";
import type { FileKind } from "../../lib/files";
import { layerInputs, layerPng, overlayGraph } from "../../lib/overlays/layers";
import { PLATFORMS } from "../make-for/platforms";
import { GIF_DEFAULTS, gifArgs } from "../video-to-gif/gif";
import { loadPreset, watermarkLayer } from "../watermark";

/** What one batch task does to one file, as an ffmpeg run. */
export interface BatchJob {
  ext: string;
  mime: string;
  suffix: string;
  duration: number;
  extraInputs?: File[];
  args: (inputs: string[]) => string[];
}

export interface BatchSettings {
  convertTo: "mp4" | "webm";
  percent: number;
  shortSide: number;
  turn: 90 | 180 | 270;
  audioFormat: "mp3" | "m4a" | "wav";
  platform: string;
}

export const DEFAULT_SETTINGS: BatchSettings = {
  convertTo: "mp4",
  percent: 50,
  shortSide: 720,
  turn: 90,
  audioFormat: "mp3",
  platform: "reels",
};

export type TaskId =
  | "convert"
  | "compress"
  | "resize"
  | "rotate"
  | "extract-audio"
  | "watermark"
  | "clean-audio"
  | "strip-metadata"
  | "video-to-gif"
  | "make-for";

export const TASKS: { id: TaskId; label: string; accepts: FileKind[] }[] = [
  { id: "convert", label: "convert", accepts: ["video"] },
  { id: "compress", label: "compress", accepts: ["video"] },
  { id: "resize", label: "resize", accepts: ["video"] },
  { id: "rotate", label: "rotate", accepts: ["video"] },
  { id: "extract-audio", label: "extract audio", accepts: ["video", "audio"] },
  { id: "watermark", label: "watermark (your saved one)", accepts: ["video"] },
  { id: "clean-audio", label: "clean up audio", accepts: ["video", "audio"] },
  { id: "strip-metadata", label: "remove all metadata", accepts: ["video", "audio"] },
  { id: "video-to-gif", label: "video to gif (first 10 s)", accepts: ["video"] },
  { id: "make-for", label: "post (platform sizes)", accepts: ["video"] },
];

const out = (ext: string) => `/out/out.${ext}`;

export async function batchJob(task: TaskId, s: BatchSettings, info: MediaInfo): Promise<BatchJob> {
  const d = info.duration;
  const v = info.video[0];
  const hasAudio = info.audio.length > 0;
  const ext = info.name.split(".").pop()?.toLowerCase() || "mp4";
  switch (task) {
    case "convert":
      return {
        ext: s.convertTo,
        mime: `video/${s.convertTo}`,
        suffix: "converted",
        duration: d,
        args: ([i]) => [
          "-i",
          i!,
          ...(s.convertTo === "webm"
            ? ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus"]
            : ENCODE_MP4),
          out(s.convertTo),
        ],
      };
    case "compress": {
      const total = (info.size * 8) / Math.max(d, 1);
      const vb = Math.max(150_000, total * (1 - s.percent / 100) - 128_000);
      return {
        ext: "mp4",
        mime: "video/mp4",
        suffix: "compressed",
        duration: d,
        args: ([i]) => [
          "-i", i!,
          "-c:v", "libx264", "-preset", "veryfast", "-b:v", String(Math.round(vb)),
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
          out("mp4"),
        ],
      };
    }
    case "resize":
      return {
        ext: "mp4",
        mime: "video/mp4",
        suffix: `${s.shortSide}p`,
        duration: d,
        args: ([i]) => [
          "-i", i!,
          "-vf", `scale='if(gt(iw,ih),-2,${s.shortSide})':'if(gt(iw,ih),${s.shortSide},-2)'`,
          ...ENCODE_MP4,
          out("mp4"),
        ],
      };
    case "rotate":
      return {
        ext: "mp4",
        mime: "video/mp4",
        suffix: "rotated",
        duration: d,
        args: ([i]) => [
          "-i", i!,
          "-vf", s.turn === 90 ? "transpose=1" : s.turn === 270 ? "transpose=2" : "hflip,vflip",
          ...ENCODE_MP4,
          out("mp4"),
        ],
      };
    case "extract-audio": {
      const codec =
        s.audioFormat === "mp3"
          ? ["-c:a", "libmp3lame", "-b:a", "192k"]
          : s.audioFormat === "m4a"
            ? ["-c:a", "aac", "-b:a", "192k"]
            : ["-c:a", "pcm_s16le"];
      return {
        ext: s.audioFormat,
        mime: s.audioFormat === "mp3" ? "audio/mpeg" : s.audioFormat === "m4a" ? "audio/mp4" : "audio/wav",
        suffix: "",
        duration: d,
        args: ([i]) => ["-i", i!, "-vn", ...codec, out(s.audioFormat)],
      };
    }
    case "watermark": {
      const preset = loadPreset();
      if (!preset || !v) throw new FriendlyError("Save a watermark in the watermark tool first.");
      const layer = await watermarkLayer(preset, v.width, v.height, { start: 0, end: d });
      const png = await layerPng(layer, v.width, v.height);
      return {
        ext: "mp4",
        mime: "video/mp4",
        suffix: "watermarked",
        duration: d,
        extraInputs: [png],
        args: ([i, ...rest]) => [
          "-i", i!, ...layerInputs(rest, d),
          "-filter_complex", overlayGraph([layer]),
          "-map", "[v]", "-map", "0:a:0?", ...ENCODE_MP4,
          out("mp4"),
        ],
      };
    }
    case "clean-audio": {
      const video = !!v;
      const e = video ? (["mp4", "mov", "mkv"].includes(ext) ? ext : "mp4") : "m4a";
      return {
        ext: e,
        mime: video ? "video/mp4" : "audio/mp4",
        suffix: "clean",
        duration: d,
        args: ([i]) => [
          "-i", i!, "-map", "0:v:0?", "-map", "0:a:0",
          "-af", "afftdn=nr=12:nf=-40,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          out(e),
        ],
      };
    }
    case "strip-metadata":
      return {
        ext,
        mime: info.format.mime || "application/octet-stream",
        suffix: "clean",
        duration: d,
        args: ([i]) => [
          "-i", i!, "-map", "0", "-map_metadata", "-1", "-map_metadata:s", "-1",
          "-map_chapters", "-1", "-fflags", "+bitexact", "-c", "copy",
          out(ext),
        ],
      };
    case "video-to-gif": {
      const settings = { ...GIF_DEFAULTS, start: 0, end: Math.min(d, 10) };
      return {
        ext: "gif",
        mime: "image/gif",
        suffix: "",
        duration: settings.end,
        args: ([i]) => gifArgs(i!, out("gif"), settings),
      };
    }
    case "make-for": {
      const p = PLATFORMS.find((x) => x.id === s.platform) ?? PLATFORMS[0]!;
      const length = p.maxSeconds ? Math.min(d, p.maxSeconds) : d;
      return {
        ext: "mp4",
        mime: "video/mp4",
        suffix: p.id,
        duration: length,
        args: ([i]) => [
          "-i", i!, "-t", String(length),
          "-filter_complex", fitGraph("0:v", "v", p.width, p.height, "blur"),
          "-map", "[v]", ...(hasAudio ? ["-map", "0:a:0"] : []), "-r", "30",
          ...ENCODE_MP4,
          out("mp4"),
        ],
      };
    }
  }
}
