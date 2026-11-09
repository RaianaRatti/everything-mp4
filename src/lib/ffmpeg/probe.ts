import type { AudioTrackInfo, MediaInfo, VideoTrackInfo } from "../engine/inspect";
import { roundFps } from "../engine/inspect";
import { extension } from "../files";
import { parseClock } from "./logs";

/** Readable names for ffmpeg's demuxer names, and the extension each one usually has. */
const DEMUXERS: Record<string, { name: string; ext: string[] }> = {
  avi: { name: "AVI", ext: ["avi", "divx"] },
  asf: { name: "Windows Media (WMV/ASF)", ext: ["wmv", "asf", "wma"] },
  flv: { name: "Flash video (FLV)", ext: ["flv", "f4v"] },
  mpeg: { name: "MPEG program stream (MPG)", ext: ["mpg", "mpeg", "vob", "m2v", "mod"] },
  mpegvideo: { name: "MPEG video", ext: ["m2v", "mpv", "mpg"] },
  mpegts: { name: "MPEG transport stream", ext: ["ts", "mts", "m2ts", "m2t"] },
  "mov,mp4,m4a,3gp,3g2,mj2": {
    name: "MP4 / MOV / 3GP",
    ext: ["mp4", "mov", "m4v", "m4a", "3gp", "3g2", "qt"],
  },
  "matroska,webm": { name: "Matroska / WebM", ext: ["mkv", "webm", "mka"] },
  ogg: { name: "Ogg", ext: ["ogg", "ogv", "oga", "opus"] },
  rm: { name: "RealMedia", ext: ["rm", "rmvb"] },
  mxf: { name: "MXF", ext: ["mxf"] },
  dv: { name: "DV", ext: ["dv"] },
  wav: { name: "WAV", ext: ["wav"] },
  aiff: { name: "AIFF", ext: ["aif", "aiff"] },
  amr: { name: "AMR", ext: ["amr"] },
  ac3: { name: "Dolby Digital (AC-3)", ext: ["ac3"] },
  mp3: { name: "MP3", ext: ["mp3"] },
  flac: { name: "FLAC", ext: ["flac"] },
  yuv4mpegpipe: { name: "YUV4MPEG", ext: ["y4m"] },
};

/** Readable names for ffmpeg's codec names. */
const CODECS: Record<string, string> = {
  h264: "H.264",
  hevc: "H.265 (HEVC)",
  av1: "AV1",
  vp9: "VP9",
  vp8: "VP8",
  mpeg4: "MPEG-4 Part 2",
  msmpeg4v3: "MS MPEG-4 v3 (DivX 3)",
  mpeg2video: "MPEG-2",
  mpeg1video: "MPEG-1",
  wmv1: "Windows Media Video 7",
  wmv2: "Windows Media Video 8",
  wmv3: "Windows Media Video 9",
  vc1: "VC-1",
  flv1: "Sorenson Spark",
  h263: "H.263",
  theora: "Theora",
  prores: "ProRes",
  dnxhd: "DNxHD/DNxHR",
  ffv1: "FFV1",
  mjpeg: "Motion JPEG",
  rv40: "RealVideo 4",
  dvvideo: "DV",
  rawvideo: "uncompressed",
  aac: "AAC",
  mp3: "MP3",
  mp2: "MPEG Layer II",
  ac3: "Dolby Digital (AC-3)",
  eac3: "Dolby Digital Plus",
  dts: "DTS",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  alac: "Apple Lossless",
  wmav1: "Windows Media Audio 1",
  wmav2: "Windows Media Audio 2",
  wmapro: "Windows Media Audio Pro",
  amr_nb: "AMR",
  pcm_s16le: "PCM",
  pcm_s16be: "PCM",
  pcm_s24le: "PCM 24-bit",
  pcm_u8: "PCM 8-bit",
  cook: "RealAudio",
};

const CHANNELS: Record<string, number> = {
  mono: 1,
  stereo: 2,
  "2.1": 3,
  quad: 4,
  "5.0": 5,
  "5.1": 6,
  "7.1": 8,
};

/**
 * Builds media info from what `ffmpeg -i` prints, for files the browser can't read itself.
 * Codecs read this way are treated as not playable by the browser.
 */
export function parseFfmpegInfo(
  lines: readonly string[],
  file: { name: string; size: number },
): MediaInfo | null {
  let formatId: string | null = null;
  let duration = 0;
  let bitrate: number | null = null;
  const video: VideoTrackInfo[] = [];
  const audio: AudioTrackInfo[] = [];
  const subtitles: MediaInfo["subtitles"] = [];
  const tags: Record<string, string> = {};
  let section: "input" | "stream" | null = null;
  let inMetadata = false;

  for (const line of lines) {
    const input = /^Input #0, (.+?), from /.exec(line);
    if (input) {
      formatId = input[1]!;
      section = "input";
      continue;
    }
    if (!formatId) continue;
    if (/^Output #|^Stream mapping/.test(line)) break;

    const dur = /^\s*Duration:\s*([\d:.]+|N\/A)(?:, start: [-\d.]+)?, bitrate:\s*(\d+|N\/A)/.exec(
      line,
    );
    if (dur) {
      duration = parseClock(dur[1]!) ?? 0;
      bitrate = dur[2] && dur[2] !== "N/A" ? Number(dur[2]) * 1000 : null;
      inMetadata = false;
      continue;
    }

    const stream =
      /^\s*Stream #0:\d+(?:\[0x[0-9a-f]+\])?(?:\((\w+)\))?: (Video|Audio|Subtitle): (.*)$/.exec(
        line,
      );
    if (stream) {
      section = "stream";
      inMetadata = false;
      const [, lang, type, rest] = stream;
      const language = lang && lang !== "und" ? lang : null;
      const codecName = /^(\w+)/.exec(rest!)?.[1] ?? "unknown";
      const kbps = /(\d+) kb\/s/.exec(rest!);
      if (type === "Video") {
        if (/\(attached pic\)/.test(rest!)) continue;
        const size = /, (\d{2,5})x(\d{2,5})[\s,]/.exec(`${rest!},`);
        const fps = /, ([\d.]+) fps/.exec(rest!) ?? /, ([\d.]+) tbr/.exec(rest!);
        video.push({
          codec: CODECS[codecName] ?? codecName,
          codecId: null,
          codecString: null,
          width: size ? Number(size[1]) : 0,
          height: size ? Number(size[2]) : 0,
          rotation: 0,
          fps: fps ? roundFps(Number(fps[1])) : null,
          variableFrameRate: null,
          bitrate: kbps ? Number(kbps[1]) * 1000 : null,
          hdr: /smpte2084|arib-std-b67/.test(rest!),
          canDecode: false,
          language,
        });
      } else if (type === "Audio") {
        const rate = /(\d+) Hz/.exec(rest!);
        const layout = /Hz, ([\w.()]+)/.exec(rest!)?.[1]?.replace(/\(.*\)/, "") ?? "";
        audio.push({
          codec: CODECS[codecName] ?? codecName,
          codecId: null,
          codecString: null,
          sampleRate: rate ? Number(rate[1]) : 0,
          channels:
            CHANNELS[layout] ??
            (/(\d+) channels/.exec(rest!) ? Number(/(\d+) channels/.exec(rest!)![1]) : 2),
          bitrate: kbps ? Number(kbps[1]) * 1000 : null,
          canDecode: false,
          language,
          number: audio.length + 1,
        });
      } else {
        subtitles.push({ codec: codecName, language });
      }
      continue;
    }

    // Rotation shows up as stream side data.
    const rotation = /rotation of (-?[\d.]+) degrees/.exec(line);
    if (rotation && video.length) {
      // ffmpeg reports counter-clockwise; we use clockwise, like mediabunny.
      video.at(-1)!.rotation = ((-Math.round(Number(rotation[1])) % 360) + 360) % 360;
      continue;
    }

    if (/^\s*Metadata:\s*$/.test(line)) {
      inMetadata = true;
      continue;
    }
    const meta = /^\s{4}(\w[\w.-]*)\s*:\s?(.*)$/.exec(line);
    if (inMetadata && section === "input" && meta) {
      const key = meta[1]!.toLowerCase();
      const value = meta[2]!.trim();
      if (
        value &&
        ["title", "artist", "album", "comment", "description", "genre", "encoder", "date"].includes(
          key,
        )
      ) {
        tags[key] = value;
      } else if (value && key === "creation_time") {
        tags.created = value;
      }
    }
  }

  if (!formatId) return null;
  const known = DEMUXERS[formatId];
  const ext = extension(file.name);
  return {
    name: file.name,
    size: file.size,
    format: { name: known?.name ?? formatId.split(",")[0]!.toUpperCase(), id: formatId, mime: "" },
    realExtension: known && !known.ext.includes(ext) ? known.ext[0]! : null,
    duration,
    bitrate: bitrate ?? (duration > 0 ? (file.size * 8) / duration : null),
    video,
    audio,
    subtitles,
    tags,
    hasCoverArt: lines.some((l) => /\(attached pic\)/.test(l)),
    canPlay: false,
    fastStart: null,
    readBy: "engine",
  };
}
