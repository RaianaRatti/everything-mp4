import {
  canDecodeAudio,
  canDecodeVideo,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import { AUDIO_CODECS, VIDEO_CODECS, type AudioCodecId, type VideoCodecId } from "./formats";

let encodersReady: Promise<void> | null = null;

/**
 * Registers mediabunny's own MP3 and FLAC encoders (browsers don't have them). They're only
 * downloaded the first time a tool needs to know what it can make.
 */
export function ensureEncoders(): Promise<void> {
  encodersReady ??= Promise.all([
    import("@mediabunny/mp3-encoder"),
    import("@mediabunny/flac-encoder"),
  ]).then(([mp3, flac]) => {
    mp3.registerMp3Encoder();
    flac.registerFlacEncoder();
  });
  return encodersReady;
}

export interface Capability<Id extends string> {
  id: Id;
  label: string;
  ok: boolean;
}

export interface BrowserCapabilities {
  /** File types a <video>/<audio> element plays. */
  play: Capability<string>[];
  decodeVideo: Capability<VideoCodecId>[];
  decodeAudio: Capability<AudioCodecId>[];
  encodeVideo: Capability<VideoCodecId>[];
  encodeAudio: Capability<AudioCodecId>[];
}

const PLAY_TYPES = [
  { id: "mp4", label: "MP4 (H.264)", type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' },
  { id: "hevc", label: "MP4 (H.265)", type: 'video/mp4; codecs="hvc1.1.6.L93.B0"' },
  { id: "av1", label: "MP4 (AV1)", type: 'video/mp4; codecs="av01.0.05M.08"' },
  { id: "webm", label: "WebM (VP9)", type: 'video/webm; codecs="vp9, opus"' },
  { id: "mkv", label: "MKV", type: "video/x-matroska" },
  { id: "ogv", label: "OGV (Theora)", type: 'video/ogg; codecs="theora"' },
  { id: "mp3", label: "MP3", type: "audio/mpeg" },
  { id: "m4a", label: "M4A (AAC)", type: 'audio/mp4; codecs="mp4a.40.2"' },
  { id: "wav", label: "WAV", type: "audio/wav" },
  { id: "flac", label: "FLAC", type: "audio/flac" },
  { id: "opus", label: "Opus", type: 'audio/ogg; codecs="opus"' },
];

const VIDEO_CHECKS: VideoCodecId[] = ["h264", "hevc", "av1", "vp9", "vp8"];
const AUDIO_CHECKS: AudioCodecId[] = ["aac", "opus", "mp3", "flac", "pcm"];

let cached: Promise<BrowserCapabilities> | null = null;

/** What this browser can play, decode and encode. Checked once, then remembered. */
export function browserCapabilities(): Promise<BrowserCapabilities> {
  cached ??= (async () => {
    await ensureEncoders().catch(() => {});
    const video = document.createElement("video");
    const size = { width: 1920, height: 1080 };
    const check = async <T>(fn: () => Promise<T>) => {
      try {
        return Boolean(await fn());
      } catch {
        return false;
      }
    };
    const [decodeVideo, decodeAudio, encodeVideo, encodeAudio] = await Promise.all([
      Promise.all(
        VIDEO_CHECKS.map(async (id) => ({
          id,
          label: VIDEO_CODECS[id].label,
          ok: await check(() => canDecodeVideo(VIDEO_CODECS[id].mb as VideoCodec)),
        })),
      ),
      Promise.all(
        AUDIO_CHECKS.map(async (id) => ({
          id,
          label: AUDIO_CODECS[id].label,
          ok: await check(() => canDecodeAudio(AUDIO_CODECS[id].mb as AudioCodec)),
        })),
      ),
      Promise.all(
        VIDEO_CHECKS.map(async (id) => ({
          id,
          label: VIDEO_CODECS[id].label,
          ok: await check(() => canEncodeVideo(VIDEO_CODECS[id].mb as VideoCodec, size)),
        })),
      ),
      Promise.all(
        AUDIO_CHECKS.map(async (id) => ({
          id,
          label: AUDIO_CODECS[id].label,
          ok: await check(() =>
            canEncodeAudio(AUDIO_CODECS[id].mb as AudioCodec, {
              numberOfChannels: 2,
              sampleRate: 48_000,
            }),
          ),
        })),
      ),
    ]);
    return {
      play: PLAY_TYPES.map((p) => ({
        id: p.id,
        label: p.label,
        ok: video.canPlayType(p.type) !== "",
      })),
      decodeVideo,
      decodeAudio,
      encodeVideo,
      encodeAudio,
    };
  })();
  return cached;
}

/** Whether the browser can encode this video codec at this size (cached per codec and size). */
const encodeChecks = new Map<string, Promise<boolean>>();
export function canEncodeVideoAt(
  codec: VideoCodecId,
  width: number,
  height: number,
): Promise<boolean> {
  const mb = VIDEO_CODECS[codec].mb;
  if (!mb) return Promise.resolve(false);
  const key = `${codec}:${width}x${height}`;
  let result = encodeChecks.get(key);
  if (!result) {
    result = canEncodeVideo(mb, { width, height }).catch(() => false);
    encodeChecks.set(key, result);
  }
  return result;
}

const audioEncodeChecks = new Map<string, Promise<boolean>>();
export function canEncodeAudioCodec(
  codec: AudioCodecId,
  sampleRate = 48_000,
  channels = 2,
): Promise<boolean> {
  const mb = AUDIO_CODECS[codec].mb;
  if (!mb) return Promise.resolve(false);
  const key = `${codec}:${sampleRate}:${channels}`;
  let result = audioEncodeChecks.get(key);
  if (!result) {
    result = ensureEncoders()
      .then(() => canEncodeAudio(mb, { numberOfChannels: channels, sampleRate }))
      .catch(() => false);
    audioEncodeChecks.set(key, result);
  }
  return result;
}
