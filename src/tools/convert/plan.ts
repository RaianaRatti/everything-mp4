import { chooseEngine, type EngineChoice } from "../../lib/engine/choose";
import {
  audioBitrate,
  scaleToShortSide,
  sizeFor,
  videoBitrate,
  type QualityChoice,
} from "../../lib/engine/estimate";
import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  ffmpegMuxer,
  mediabunnyCanWrite,
  type AudioCodecId,
  type VideoCodecId,
  type VideoFormat,
} from "../../lib/engine/formats";
import type { MediaInfo } from "../../lib/engine/inspect";
import type { Abilities } from "../../lib/ffmpeg/hooks";
import type { Size } from "../../lib/layout";

export interface ConvertSettings {
  format: string;
  videoCodec: VideoCodecId;
  audioCodec: AudioCodecId;
  quality: QualityChoice;
  /** Short side in pixels (720 for 720p), or null to keep the size. */
  resolution: number | null;
  fps: number | null;
  removeAudio: boolean;
  /** For MPG/VOB: standard DVD size and frame rate. */
  dvd: boolean;
}

export const DEFAULTS: ConvertSettings = {
  format: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  quality: "balanced",
  resolution: null,
  fps: null,
  removeAudio: false,
  dvd: false,
};

export interface Preset {
  id: string;
  label: string;
  note: string;
  settings: Partial<ConvertSettings>;
}

export const PRESETS: Preset[] = [
  {
    id: "everywhere",
    label: "plays everywhere",
    note: "MP4, H.264",
    settings: {
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      quality: "balanced",
      resolution: null,
      dvd: false,
    },
  },
  {
    id: "web",
    label: "web",
    note: "WebM, up to 1080p",
    settings: {
      format: "webm",
      videoCodec: "vp9",
      audioCodec: "opus",
      quality: "balanced",
      resolution: 1080,
      dvd: false,
    },
  },
  {
    id: "iphone",
    label: "iPhone",
    note: "MOV, H.264",
    settings: {
      format: "mov",
      videoCodec: "h264",
      audioCodec: "aac",
      quality: "high",
      resolution: null,
      dvd: false,
    },
  },
  {
    id: "android",
    label: "Android",
    note: "MP4, up to 1080p",
    settings: {
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      quality: "balanced",
      resolution: 1080,
      dvd: false,
    },
  },
  {
    id: "dvd",
    label: "old DVD player",
    note: "MPG, DVD size",
    settings: {
      format: "mpg",
      videoCodec: "mpeg2",
      audioCodec: "mp2",
      quality: "high",
      resolution: null,
      fps: null,
      dvd: true,
    },
  },
  {
    id: "editing",
    label: "video editing",
    note: "ProRes",
    settings: {
      format: "prores",
      videoCodec: "prores",
      audioCodec: "pcm",
      resolution: null,
      dvd: false,
    },
  },
  {
    id: "archive",
    label: "archive",
    note: "FFV1, lossless",
    settings: {
      format: "ffv1",
      videoCodec: "ffv1",
      audioCodec: "flac",
      resolution: null,
      dvd: false,
    },
  },
];

export function findFormat(id: string): VideoFormat {
  return VIDEO_FORMATS.find((f) => f.id === id) ?? VIDEO_FORMATS[0]!;
}

function browserMakes(format: VideoFormat, codec: VideoCodecId, a: Abilities): boolean {
  return (
    mediabunnyCanWrite(format.container) && !!VIDEO_CODECS[codec].mb && !!a.browserVideo[codec]
  );
}

function engineMakes(
  format: VideoFormat,
  codec: VideoCodecId | AudioCodecId,
  kind: "video" | "audio",
  a: Abilities,
): boolean {
  const ff =
    kind === "video"
      ? VIDEO_CODECS[codec as VideoCodecId].ff
      : AUDIO_CODECS[codec as AudioCodecId].ff;
  if (!ff) return false;
  if (!a.engine) return true;
  return a.engine.muxers.has(ffmpegMuxer(format.container)) && a.engine.encoders.has(ff);
}

/** Video codecs this format can be made with here. */
export function videoCodecsFor(format: VideoFormat, a: Abilities): VideoCodecId[] {
  return format.video.filter(
    (c) => browserMakes(format, c, a) || engineMakes(format, c, "video", a),
  );
}

export function audioCodecsFor(format: VideoFormat, a: Abilities): AudioCodecId[] {
  return format.audio.filter(
    (c) =>
      (mediabunnyCanWrite(format.container) && !!AUDIO_CODECS[c].mb && !!a.browserAudio[c]) ||
      engineMakes(format, c, "audio", a),
  );
}

/** Formats that can be made here; the rest are hidden. */
export function availableFormats(a: Abilities): VideoFormat[] {
  return VIDEO_FORMATS.filter((f) => videoCodecsFor(f, a).length > 0);
}

/** Settings adjusted so the codecs fit the format and can be made here. */
export function normalize(s: ConvertSettings, a: Abilities): ConvertSettings {
  const format = findFormat(s.format);
  const videos = videoCodecsFor(format, a);
  const audios = audioCodecsFor(format, a);
  return {
    ...s,
    videoCodec: videos.includes(s.videoCodec) ? s.videoCodec : (videos[0] ?? format.video[0]!),
    audioCodec: audios.includes(s.audioCodec) ? s.audioCodec : (audios[0] ?? format.audio[0]!),
    dvd: s.dvd && (format.id === "mpg" || format.id === "vob"),
  };
}

export interface FilePlan {
  choice: EngineChoice;
  /** Output size, when the video is re-encoded at a new size. */
  size: Size | null;
  fps: number | null;
  videoBitrate: number | null;
  audioBitrate: number | null;
  copyVideo: boolean;
  copyAudio: boolean;
  /** Estimated output size in bytes. */
  bytes: number;
  dvd: "pal" | "ntsc" | null;
}

/** How one file will be converted: which engine, what's copied, and about how big it'll be. */
export function planFile(info: MediaInfo, s: ConvertSettings, a: Abilities): FilePlan {
  const format = findFormat(s.format);
  const video = info.video[0] ?? null;
  const audio = s.removeAudio ? null : (info.audio[0] ?? null);
  const source: Size = video
    ? { width: video.width, height: video.height }
    : { width: 0, height: 0 };
  const sourceFps = video?.fps ?? 30;

  const dvd =
    s.dvd && video
      ? Math.abs(sourceFps - 25) < 1 || Math.abs(sourceFps - 50) < 1
        ? "pal"
        : "ntsc"
      : null;
  const resized = video && s.resolution ? scaleToShortSide(source, s.resolution) : null;
  const sizeChanged =
    !!resized && (resized.width !== source.width || resized.height !== source.height);
  const fpsChanged = !!s.fps && Math.abs(s.fps - sourceFps) > 0.01;
  const videoChanged = sizeChanged || fpsChanged || !!dvd;

  const choice = chooseEngine({
    browserReads: info.readBy === "browser",
    container: format.container,
    video: video
      ? { from: video.codecId, canDecode: video.canDecode, to: s.videoCodec, changed: videoChanged }
      : null,
    audio: audio
      ? { from: audio.codecId, canDecode: audio.canDecode, to: s.audioCodec, changed: false }
      : null,
    browserEncodes: {
      video: !!a.browserVideo[s.videoCodec],
      audio: !!a.browserAudio[s.audioCodec],
    },
    engine: a.engine,
  });

  const copyVideo = !!video && !videoChanged && video.codecId === s.videoCodec;
  const copyAudio = !!audio && audio.codecId === s.audioCodec;
  const outSize = resized ?? {
    width: source.width - (source.width % 2),
    height: source.height - (source.height % 2),
  };
  const fps = s.fps ?? sourceFps;
  const vBits = video
    ? copyVideo
      ? (video.bitrate ?? estimateStreamShare(info))
      : dvd
        ? 6_000_000
        : videoBitrate(s.videoCodec, outSize, fps, s.quality)
    : 0;
  const aBits = audio
    ? copyAudio
      ? (audio.bitrate ?? 128_000)
      : audioBitrate(
          s.audioCodec,
          s.quality,
          audio.sampleRate || 48_000,
          Math.min(2, audio.channels || 2),
        )
    : 0;

  return {
    choice,
    // Encoders need even sizes, so odd-sized sources get a pixel trimmed even without resizing.
    size:
      copyVideo || !video
        ? null
        : sizeChanged
          ? resized
          : source.width % 2 || source.height % 2
            ? outSize
            : null,
    fps: s.fps,
    videoBitrate: copyVideo ? null : vBits || null,
    audioBitrate: copyAudio ? null : aBits || null,
    copyVideo,
    copyAudio,
    bytes: sizeFor(vBits + aBits, info.duration),
    dvd,
  };
}

/** A video stream's bitrate when the file doesn't say: whatever the sound doesn't use. */
function estimateStreamShare(info: MediaInfo): number {
  const total = info.bitrate ?? 0;
  const sound = info.audio.reduce((sum, a) => sum + (a.bitrate ?? 128_000), 0);
  return Math.max(0, total - sound);
}
