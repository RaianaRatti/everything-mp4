import {
  AdtsOutputFormat,
  FlacOutputFormat,
  MkvOutputFormat,
  MovOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  OggOutputFormat,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioCodec as MbAudioCodec,
  type OutputFormat,
  type VideoCodec as MbVideoCodec,
} from "mediabunny";

/**
 * Codecs, by our own ids. `mb` is mediabunny's name (encodable through WebCodecs or a mediabunny
 * encoder); `ff` is the ffmpeg encoder. Either may be missing when only one engine can make it.
 */
export const VIDEO_CODECS = {
  h264: { label: "H.264", mb: "avc", ff: "libx264", note: "plays everywhere" },
  hevc: { label: "H.265 (HEVC)", mb: "hevc", ff: "libx265", note: "half the size of H.264" },
  av1: { label: "AV1", mb: "av1", ff: null, note: "smallest, newer devices only" },
  vp9: { label: "VP9", mb: "vp9", ff: "libvpx-vp9", note: "small, made for the web" },
  vp8: { label: "VP8", mb: "vp8", ff: "libvpx", note: "older web video" },
  mpeg4: { label: "MPEG-4 Part 2 (Xvid)", mb: null, ff: "mpeg4", note: "for old players" },
  mpeg2: { label: "MPEG-2", mb: null, ff: "mpeg2video", note: "DVD and TV" },
  mpeg1: { label: "MPEG-1", mb: null, ff: "mpeg1video", note: "very old players" },
  wmv2: { label: "Windows Media Video 8", mb: null, ff: "wmv2", note: "old Windows software" },
  flv1: { label: "Sorenson Spark (FLV)", mb: null, ff: "flv", note: "old Flash players" },
  h263: { label: "H.263", mb: null, ff: "h263", note: "very old phones" },
  theora: { label: "Theora", mb: null, ff: "libtheora", note: "open, older" },
  prores: { label: "ProRes 422 HQ", mb: null, ff: "prores_ks", note: "for editing, very large" },
  dnxhr: { label: "DNxHR HQ", mb: null, ff: "dnxhd", note: "for editing, very large" },
  ffv1: { label: "FFV1 (lossless)", mb: null, ff: "ffv1", note: "every pixel kept exactly" },
} as const satisfies Record<
  string,
  { label: string; mb: MbVideoCodec | null; ff: string | null; note: string }
>;

export const AUDIO_CODECS = {
  aac: { label: "AAC", mb: "aac", ff: "aac", note: "plays everywhere" },
  opus: { label: "Opus", mb: "opus", ff: "libopus", note: "best quality for its size" },
  mp3: { label: "MP3", mb: "mp3", ff: "libmp3lame", note: "plays everywhere" },
  vorbis: { label: "Vorbis", mb: null, ff: "libvorbis", note: "older open codec" },
  flac: { label: "FLAC (lossless)", mb: "flac", ff: "flac", note: "exact, larger" },
  pcm: { label: "PCM (uncompressed)", mb: "pcm-s16", ff: "pcm_s16le", note: "exact, very large" },
  pcmbe: { label: "PCM big-endian", mb: "pcm-s16be", ff: "pcm_s16be", note: "exact, very large" },
  mp2: { label: "MPEG Layer II", mb: null, ff: "mp2", note: "DVD and TV" },
  ac3: { label: "Dolby Digital (AC-3)", mb: null, ff: "ac3", note: "DVD and Blu-ray" },
  wma: { label: "Windows Media Audio", mb: null, ff: "wmav2", note: "old Windows software" },
  alac: { label: "Apple Lossless (ALAC)", mb: null, ff: "alac", note: "exact, for Apple devices" },
} as const satisfies Record<
  string,
  { label: string; mb: MbAudioCodec | null; ff: string | null; note: string }
>;

export type VideoCodecId = keyof typeof VIDEO_CODECS;
export type AudioCodecId = keyof typeof AUDIO_CODECS;

/** Our codec id for a mediabunny codec name, if we know it. */
export function videoCodecFromMb(codec: string | null): VideoCodecId | null {
  const entry = Object.entries(VIDEO_CODECS).find(([, c]) => c.mb === codec);
  return (entry?.[0] as VideoCodecId | undefined) ?? null;
}

export function audioCodecFromMb(codec: string | null): AudioCodecId | null {
  if (codec?.startsWith("pcm-")) return codec.endsWith("be") ? "pcmbe" : "pcm";
  const entry = Object.entries(AUDIO_CODECS).find(([, c]) => c.mb === codec);
  return (entry?.[0] as AudioCodecId | undefined) ?? null;
}

/** Containers, i.e. how the file is packaged. `mb` says mediabunny can write it itself. */
export type ContainerId =
  | "mp4"
  | "mov"
  | "webm"
  | "mkv"
  | "avi"
  | "asf"
  | "flv"
  | "mpeg"
  | "vob"
  | "mpegts"
  | "m2ts"
  | "3gp"
  | "ogg"
  | "mp3"
  | "ipod"
  | "wav"
  | "flac"
  | "aiff"
  | "adts";

const CONTAINERS: Record<ContainerId, { ff: string; mb: boolean }> = {
  mp4: { ff: "mp4", mb: true },
  mov: { ff: "mov", mb: true },
  webm: { ff: "webm", mb: true },
  mkv: { ff: "matroska", mb: true },
  avi: { ff: "avi", mb: false },
  asf: { ff: "asf", mb: false },
  flv: { ff: "flv", mb: false },
  mpeg: { ff: "mpeg", mb: false },
  vob: { ff: "vob", mb: false },
  mpegts: { ff: "mpegts", mb: true },
  m2ts: { ff: "mpegts", mb: false },
  "3gp": { ff: "3gp", mb: false },
  ogg: { ff: "ogg", mb: true },
  mp3: { ff: "mp3", mb: true },
  ipod: { ff: "ipod", mb: true },
  wav: { ff: "wav", mb: true },
  flac: { ff: "flac", mb: true },
  aiff: { ff: "aiff", mb: false },
  adts: { ff: "adts", mb: true },
};

export function ffmpegMuxer(container: ContainerId): string {
  return CONTAINERS[container].ff;
}

export function mediabunnyCanWrite(container: ContainerId): boolean {
  return CONTAINERS[container].mb;
}

/**
 * A mediabunny output format for a container. `fastStart` puts an MP4's index at the front so it
 * starts playing before it has fully downloaded; "reserve" does that without holding the file in
 * memory (used when writing straight to disk).
 */
export function mediabunnyFormat(
  container: ContainerId,
  fastStart: "in-memory" | "reserve" = "in-memory",
): OutputFormat {
  switch (container) {
    case "mp4":
    case "ipod":
      return new Mp4OutputFormat({ fastStart });
    case "mov":
      return new MovOutputFormat({ fastStart });
    case "webm":
      return new WebMOutputFormat();
    case "mkv":
      return new MkvOutputFormat();
    case "mpegts":
      return new MpegTsOutputFormat({ timestampOffset: 10 });
    case "ogg":
      return new OggOutputFormat();
    case "mp3":
      return new Mp3OutputFormat();
    case "wav":
      return new WavOutputFormat({ large: true });
    case "flac":
      return new FlacOutputFormat();
    case "adts":
      return new AdtsOutputFormat();
    default:
      throw new Error(`mediabunny can't write ${container}`);
  }
}

export type FormatGroup = "common" | "older or other" | "editing" | "archive";

/** A video format people can pick in convert. */
export interface VideoFormat {
  id: string;
  label: string;
  group: FormatGroup;
  description: string;
  container: ContainerId;
  ext: string;
  mime: string;
  /** In order of preference; the first one that can be made is the default. */
  video: VideoCodecId[];
  audio: AudioCodecId[];
  /** Fixed sizes some formats need (DVD), as [width, height] by frame rate family. */
  dvd?: boolean;
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "mp4",
    label: "MP4",
    group: "common",
    description: "plays almost everywhere",
    container: "mp4",
    ext: "mp4",
    mime: "video/mp4",
    video: ["h264", "hevc", "av1", "vp9"],
    audio: ["aac", "opus", "mp3"],
  },
  {
    id: "mov",
    label: "MOV",
    group: "common",
    description: "Apple's format: Macs, iPhones, Final Cut",
    container: "mov",
    ext: "mov",
    mime: "video/quicktime",
    video: ["h264", "hevc"],
    audio: ["aac", "pcm"],
  },
  {
    id: "webm",
    label: "WebM",
    group: "common",
    description: "for websites; small files",
    container: "webm",
    ext: "webm",
    mime: "video/webm",
    video: ["vp9", "av1", "vp8"],
    audio: ["opus", "vorbis"],
  },
  {
    id: "mkv",
    label: "MKV",
    group: "common",
    description: "holds almost anything; VLC and media players",
    container: "mkv",
    ext: "mkv",
    mime: "video/x-matroska",
    video: ["h264", "hevc", "vp9", "av1"],
    audio: ["aac", "opus", "mp3", "flac"],
  },
  {
    id: "avi",
    label: "AVI",
    group: "older or other",
    description: "older Windows format; old players and TVs",
    container: "avi",
    ext: "avi",
    mime: "video/x-msvideo",
    video: ["mpeg4", "h264"],
    audio: ["mp3", "ac3"],
  },
  {
    id: "wmv",
    label: "WMV",
    group: "older or other",
    description: "Windows Media, for old Windows software",
    container: "asf",
    ext: "wmv",
    mime: "video/x-ms-wmv",
    video: ["wmv2"],
    audio: ["wma"],
  },
  {
    id: "flv",
    label: "FLV",
    group: "older or other",
    description: "old Flash video",
    container: "flv",
    ext: "flv",
    mime: "video/x-flv",
    video: ["flv1", "h264"],
    audio: ["mp3", "aac"],
  },
  {
    id: "mpg",
    label: "MPG (MPEG-2)",
    group: "older or other",
    description: "DVD players and old software",
    container: "mpeg",
    ext: "mpg",
    mime: "video/mpeg",
    video: ["mpeg2", "mpeg1"],
    audio: ["mp2", "ac3"],
  },
  {
    id: "vob",
    label: "VOB",
    group: "older or other",
    description: "the files on a video DVD",
    container: "vob",
    ext: "vob",
    mime: "video/mpeg",
    video: ["mpeg2"],
    audio: ["ac3", "mp2"],
    dvd: true,
  },
  {
    id: "ts",
    label: "MPEG-TS",
    group: "older or other",
    description: "TV broadcasts and set-top boxes",
    container: "mpegts",
    ext: "ts",
    mime: "video/mp2t",
    video: ["h264", "hevc", "mpeg2"],
    audio: ["aac", "mp2", "ac3"],
  },
  {
    id: "m2ts",
    label: "M2TS",
    group: "older or other",
    description: "Blu-ray discs and AVCHD camcorders",
    container: "m2ts",
    ext: "m2ts",
    mime: "video/mp2t",
    video: ["h264", "mpeg2"],
    audio: ["ac3", "aac"],
  },
  {
    id: "3gp",
    label: "3GP",
    group: "older or other",
    description: "very old mobile phones",
    container: "3gp",
    ext: "3gp",
    mime: "video/3gpp",
    video: ["h264", "h263", "mpeg4"],
    audio: ["aac"],
  },
  {
    id: "ogv",
    label: "OGV",
    group: "older or other",
    description: "open format used by Wikipedia",
    container: "ogg",
    ext: "ogv",
    mime: "video/ogg",
    video: ["theora"],
    audio: ["vorbis", "opus"],
  },
  {
    id: "prores",
    label: "ProRes (MOV)",
    group: "editing",
    description: "smooth editing in Final Cut, Premiere, DaVinci; huge files",
    container: "mov",
    ext: "mov",
    mime: "video/quicktime",
    video: ["prores"],
    audio: ["pcm"],
  },
  {
    id: "dnxhr",
    label: "DNxHR (MOV)",
    group: "editing",
    description: "smooth editing in Avid and Premiere; huge files",
    container: "mov",
    ext: "mov",
    mime: "video/quicktime",
    video: ["dnxhr"],
    audio: ["pcm"],
  },
  {
    id: "ffv1",
    label: "FFV1 (MKV)",
    group: "archive",
    description: "lossless: keeps every pixel exactly; very large",
    container: "mkv",
    ext: "mkv",
    mime: "video/x-matroska",
    video: ["ffv1"],
    audio: ["flac"],
  },
];

/** An audio format people can pick in extract audio. */
export interface AudioFormat {
  id: string;
  label: string;
  description: string;
  container: ContainerId;
  ext: string;
  mime: string;
  codec: AudioCodecId;
  /** Lossy codecs take a bitrate; lossless ones don't. */
  lossy: boolean;
  /** Can hold title, artist, album and cover art. */
  tags: "full" | "text" | "none";
  /** Longest allowed length, in seconds (iPhone ringtones). */
  maxSeconds?: number;
}

export const AUDIO_FORMATS: AudioFormat[] = [
  {
    id: "mp3",
    label: "MP3",
    description: "plays everywhere",
    container: "mp3",
    ext: "mp3",
    mime: "audio/mpeg",
    codec: "mp3",
    lossy: true,
    tags: "full",
  },
  {
    id: "m4a",
    label: "M4A (AAC)",
    description: "Apple devices and most players; smaller than MP3",
    container: "ipod",
    ext: "m4a",
    mime: "audio/mp4",
    codec: "aac",
    lossy: true,
    tags: "full",
  },
  {
    id: "wav",
    label: "WAV",
    description: "uncompressed: exact, very large",
    container: "wav",
    ext: "wav",
    mime: "audio/wav",
    codec: "pcm",
    lossy: false,
    tags: "text",
  },
  {
    id: "flac",
    label: "FLAC",
    description: "lossless: exact, about half the size of WAV",
    container: "flac",
    ext: "flac",
    mime: "audio/flac",
    codec: "flac",
    lossy: false,
    tags: "full",
  },
  {
    id: "opus",
    label: "OGG (Opus)",
    description: "best quality for its size; not for old Apple devices",
    container: "ogg",
    ext: "ogg",
    mime: "audio/ogg",
    codec: "opus",
    lossy: true,
    tags: "text",
  },
  {
    id: "aiff",
    label: "AIFF",
    description: "uncompressed, for Mac audio apps",
    container: "aiff",
    ext: "aiff",
    mime: "audio/aiff",
    codec: "pcmbe",
    lossy: false,
    tags: "none",
  },
  {
    id: "alac",
    label: "ALAC",
    description: "lossless, for Apple Music and iTunes",
    container: "ipod",
    ext: "m4a",
    mime: "audio/mp4",
    codec: "alac",
    lossy: false,
    tags: "text",
  },
  {
    id: "wma",
    label: "WMA",
    description: "for old Windows software",
    container: "asf",
    ext: "wma",
    mime: "audio/x-ms-wma",
    codec: "wma",
    lossy: true,
    tags: "text",
  },
  {
    id: "m4r",
    label: "iPhone ringtone (M4R)",
    description: "at most 40 seconds",
    container: "ipod",
    ext: "m4r",
    mime: "audio/mp4",
    codec: "aac",
    lossy: true,
    tags: "none",
    maxSeconds: 40,
  },
];
