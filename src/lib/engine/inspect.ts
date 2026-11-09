import {
  ADTS,
  FLAC,
  MATROSKA,
  MP3,
  MP4,
  MPEG_TS,
  OGG,
  QTFF,
  WAVE,
  WEBM,
  type InputAudioTrack,
  type InputFormat,
  type InputVideoTrack,
} from "mediabunny";
import { FriendlyError } from "../errors";
import { extension } from "../files";
import { openInput } from "../probe";
import { isFastStart, topLevelBoxes } from "./boxes";
import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  audioCodecFromMb,
  videoCodecFromMb,
  type AudioCodecId,
  type VideoCodecId,
} from "./formats";

export interface VideoTrackInfo {
  codec: string;
  codecId: VideoCodecId | null;
  /** The full codec string, e.g. "avc1.64001f". */
  codecString: string | null;
  /** As shown, after rotation and pixel aspect ratio. */
  width: number;
  height: number;
  /** Clockwise rotation the player applies, from the file's rotation flag. */
  rotation: number;
  fps: number | null;
  /** True for variable frame rate, null when unknown. */
  variableFrameRate: boolean | null;
  bitrate: number | null;
  hdr: boolean;
  /** Whether this browser can decode it. */
  canDecode: boolean;
  language: string | null;
}

export interface AudioTrackInfo {
  codec: string;
  codecId: AudioCodecId | null;
  codecString: string | null;
  sampleRate: number;
  channels: number;
  bitrate: number | null;
  canDecode: boolean;
  language: string | null;
  /** 1-based number among the file's audio tracks, for picking one. */
  number: number;
}

export interface MediaInfo {
  name: string;
  size: number;
  /** The container as detected from the file's contents, not its name. */
  format: { name: string; id: string; mime: string };
  /** Set when the name's extension doesn't match the real format, e.g. a MOV named .mp4. */
  realExtension: string | null;
  duration: number;
  /** Overall bits per second. */
  bitrate: number | null;
  video: VideoTrackInfo[];
  audio: AudioTrackInfo[];
  subtitles: { codec: string; language: string | null }[];
  tags: Record<string, string>;
  hasCoverArt: boolean;
  /** Whether a <video> element in this browser should play the file. */
  canPlay: boolean;
  /** For MP4/MOV: whether it starts playing before fully downloaded. */
  fastStart: boolean | null;
  /** Read by the browser (mediabunny) or by the video engine (ffmpeg). */
  readBy: "browser" | "engine";
}

/** Thrown when only the video engine can read a file. */
export class NeedsEngineError extends FriendlyError {
  constructor(name: string) {
    super(
      `This browser can't read ${extension(name).toUpperCase() || "this"} files by itself. Load the video engine to open ${name}.`,
    );
    this.name = "NeedsEngineError";
  }
}

/** Formats mediabunny reads, with a short id, a readable name and the extensions they go by. */
const FORMATS: { format: InputFormat; id: string; name: string; exts: string[] }[] = [
  {
    format: MP4,
    id: "mp4",
    name: "MP4",
    exts: ["mp4", "m4v", "m4a", "m4r", "m4b", "3gp", "3g2", "f4v"],
  },
  { format: QTFF, id: "mov", name: "QuickTime (MOV)", exts: ["mov", "qt", "mp4", "m4v"] },
  { format: WEBM, id: "webm", name: "WebM", exts: ["webm", "weba", "mkv"] },
  { format: MATROSKA, id: "mkv", name: "Matroska (MKV)", exts: ["mkv", "mka", "mk3d"] },
  { format: MP3, id: "mp3", name: "MP3", exts: ["mp3"] },
  { format: WAVE, id: "wav", name: "WAV", exts: ["wav", "wave"] },
  { format: OGG, id: "ogg", name: "Ogg", exts: ["ogg", "oga", "ogv", "opus"] },
  { format: ADTS, id: "aac", name: "AAC (ADTS)", exts: ["aac"] },
  { format: FLAC, id: "flac", name: "FLAC", exts: ["flac"] },
  { format: MPEG_TS, id: "ts", name: "MPEG transport stream", exts: ["ts", "mts", "m2ts", "m2t"] },
];

/** Checks a file's real format against its extension; returns the right extension if they differ. */
export function realExtension(
  name: string,
  formatId: string,
  knownExts: readonly string[],
): string | null {
  const ext = extension(name);
  if (knownExts.includes(ext)) return null;
  return knownExts[0] ?? formatId;
}

/**
 * Reads everything we can tell about a media file. Files the browser can't read throw
 * NeedsEngineError; the video engine can read them with `inspectWithEngine`.
 */
export async function inspectMedia(file: File): Promise<MediaInfo> {
  const input = openInput(file);
  try {
    const format = await input.getFormat().catch(() => null);
    const known = FORMATS.find((f) => f.format === format);
    if (!format || !known) throw new NeedsEngineError(file.name);

    const [videoTracks, audioTracks, allTracks, duration, mime, tags] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
      input.getTracks(),
      input.computeDuration().catch(() => 0),
      input.getMimeType().catch(() => format.mimeType),
      input
        .getMetadataTags()
        .catch(() => ({}) as Awaited<ReturnType<typeof input.getMetadataTags>>),
    ]);
    const start = await input.getFirstTimestamp().catch(() => 0);
    const video = await Promise.all(videoTracks.map(describeVideo));
    const audio = await Promise.all(audioTracks.map(describeAudio));
    const subtitles = await Promise.all(
      allTracks
        .filter((t) => t.type === "subtitle")
        .map(async (t) => ({
          codec: String((await t.getCodec()) ?? "unknown"),
          language: language(await t.getLanguageCode()),
        })),
    );
    const length = Math.max(0, duration - Math.max(0, start));
    const isobmff = known.id === "mp4" || known.id === "mov";

    return {
      name: file.name,
      size: file.size,
      format: { name: known.name, id: known.id, mime },
      realExtension: realExtension(file.name, known.id, known.exts),
      duration: length,
      bitrate: length > 0 ? (file.size * 8) / length : null,
      video,
      audio,
      subtitles,
      tags: readableTags(tags),
      hasCoverArt: (tags.images?.length ?? 0) > 0,
      canPlay: browserCanPlay(mime, video, audio),
      fastStart: isobmff ? isFastStart(await topLevelBoxes(file)) : null,
      readBy: "browser",
    };
  } finally {
    input.dispose();
  }
}

async function describeVideo(track: InputVideoTrack): Promise<VideoTrackInfo> {
  const [codec, codecString, width, height, rotation, hdr, canDecode, lang] = await Promise.all([
    track.getCodec(),
    track.getCodecParameterString().catch(() => null),
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.getRotation(),
    track.hasHighDynamicRange().catch(() => false),
    track.canDecode().catch(() => false),
    track.getLanguageCode().catch(() => "und"),
  ]);
  const metrics = await track.computeFrameRateMetrics({ targetPacketCount: 256 }).catch(() => null);
  const id = videoCodecFromMb(codec);
  return {
    codec: id ? VIDEO_CODECS[id].label : String(codec ?? "unknown"),
    codecId: id,
    codecString,
    width,
    height,
    rotation,
    fps: metrics ? roundFps(metrics.bestGuessFrameRate) : null,
    // A few hundred frames is enough to tell; very short clips can't say much.
    variableFrameRate:
      metrics && metrics.probedPacketCount >= 30 ? metrics.underlyingFrameRate === null : null,
    bitrate: await trackBitrate(track),
    hdr,
    canDecode,
    language: language(lang),
  };
}

async function describeAudio(track: InputAudioTrack): Promise<AudioTrackInfo> {
  const [codec, codecString, sampleRate, channels, canDecode, lang] = await Promise.all([
    track.getCodec(),
    track.getCodecParameterString().catch(() => null),
    track.getSampleRate(),
    track.getNumberOfChannels(),
    track.canDecode().catch(() => false),
    track.getLanguageCode().catch(() => "und"),
  ]);
  const id = audioCodecFromMb(codec);
  return {
    codec: id ? AUDIO_CODECS[id].label : String(codec ?? "unknown"),
    codecId: id,
    codecString,
    sampleRate,
    channels,
    bitrate: await trackBitrate(track),
    canDecode,
    language: language(lang),
    number: track.number,
  };
}

async function trackBitrate(track: InputVideoTrack | InputAudioTrack): Promise<number | null> {
  const fromMetadata = await track.getAverageBitrate().catch(() => null);
  if (fromMetadata) return fromMetadata;
  // Estimate from the first few hundred packets rather than reading the whole file.
  const stats = await track.computePacketStats(300).catch(() => null);
  return stats && Number.isFinite(stats.averageBitrate) && stats.averageBitrate > 0
    ? stats.averageBitrate
    : null;
}

/** 29.97002997 → 29.97, 30.0001 → 30. */
export function roundFps(fps: number): number | null {
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return Math.round(fps * 100) / 100;
}

function language(code: string): string | null {
  return code && code !== "und" ? code : null;
}

const TAG_NAMES = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "genre",
  "comment",
  "description",
] as const;

function readableTags(
  tags: {
    [K in (typeof TAG_NAMES)[number]]?: string;
  } & { date?: Date; creationTime?: Date | null; raw?: Record<string, unknown> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TAG_NAMES) {
    const value = tags[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  if (tags.date && !Number.isNaN(tags.date.getTime()))
    out.date = tags.date.toISOString().slice(0, 10);
  if (tags.creationTime && !Number.isNaN(tags.creationTime.getTime())) {
    out.created = tags.creationTime.toLocaleString();
  }
  // A few useful raw tags: the app that made it, and the camera or phone.
  for (const [raw, label] of [
    ["encoder", "encoder"],
    ["©too", "encoder"],
    ["com.apple.quicktime.make", "make"],
    ["com.apple.quicktime.model", "model"],
    ["com.android.manufacturer", "make"],
    ["com.android.model", "model"],
    ["com.apple.quicktime.location.ISO6709", "location"],
    ["location", "location"],
    ["©xyz", "location"],
  ] as const) {
    const value = tags.raw?.[raw];
    if (typeof value === "string" && value.trim() && !out[label]) out[label] = value.trim();
  }
  return out;
}

function browserCanPlay(mime: string, video: VideoTrackInfo[], audio: AudioTrackInfo[]): boolean {
  if (![...video, ...audio].every((t) => t.canDecode)) return false;
  if (typeof document === "undefined") return false;
  const el = document.createElement("video");
  // Chrome and Safari play MOV and MKV with ordinary codecs but often say "no" for those types.
  const check = mime.replace(/^video\/quicktime/, "video/mp4");
  if (el.canPlayType(check) !== "") return true;
  return /^video\/x-matroska|^video\/quicktime/.test(mime) && el.canPlayType("video/mp4") !== "";
}

/** Plain-language warnings about things that commonly cause trouble. */
export function mediaWarnings(info: MediaInfo): string[] {
  const warnings: string[] = [];
  const ext = extension(info.name);
  if (info.realExtension) {
    warnings.push(
      `This is really a ${info.format.name} file, even though its name ends in .${ext || "(nothing)"}.`,
    );
  }
  for (const v of info.video) {
    if (v.variableFrameRate) {
      warnings.push(
        "Variable frame rate (common for phone and screen recordings). Some editing apps drift out of sync with it.",
      );
    }
    if (v.hdr) {
      warnings.push(
        "HDR video. It can look washed out on screens and in apps without HDR, and after converting.",
      );
    }
    if (v.rotation) {
      warnings.push(
        `Turned ${v.rotation}° by a rotation flag. Some players ignore the flag and show it on its side.`,
      );
    }
  }
  if (info.fastStart === false) {
    warnings.push(
      "Not optimized for streaming: online, it has to download completely before it starts playing.",
    );
  }
  if (!info.video.length && !info.audio.length)
    warnings.push("No video or audio found in this file.");
  return [...new Set(warnings)];
}
