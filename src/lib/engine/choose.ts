import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  ffmpegMuxer,
  mediabunnyCanWrite,
  type AudioCodecId,
  type ContainerId,
  type VideoCodecId,
} from "./formats";

export interface StreamPlan<Id extends string> {
  /** The source's codec, or null if unknown to us. */
  from: Id | null;
  /** Whether this browser can decode the source stream. */
  canDecode: boolean;
  /** The codec wanted in the output. */
  to: Id;
  /** Settings that force re-encoding (size, frame rate, quality, bitrate…). */
  changed: boolean;
}

export interface ChooseInput {
  /** Whether the browser (mediabunny) can read the source file at all. */
  browserReads: boolean;
  container: ContainerId;
  /** Null when the output has no video (or the source has none). */
  video: StreamPlan<VideoCodecId> | null;
  audio: StreamPlan<AudioCodecId> | null;
  /** Which output codecs this browser can encode. */
  browserEncodes: { video: boolean; audio: boolean };
  /** What the video engine can make, or null if it hasn't been checked yet (assumed fine). */
  engine: { muxers: Set<string>; encoders: Set<string> } | null;
}

export interface EngineChoice {
  /** "browser" uses mediabunny and WebCodecs; "engine" uses ffmpeg.wasm; null means impossible. */
  engine: "browser" | "engine" | null;
  /** Nothing is re-encoded: instant and no quality loss. */
  copy: boolean;
  /** A short, plain description to show ("instant, no quality loss"). */
  summary: string;
  /** Why this engine, in a sentence. */
  reason: string;
}

function copies<Id extends string>(s: StreamPlan<Id> | null): boolean {
  return !s || (!s.changed && s.from === s.to);
}

/**
 * Picks the fastest way to make a file: copy the streams as they are when nothing about them
 * changes, otherwise re-encode with the browser's (hardware) encoder, otherwise use the video
 * engine. Explains the choice in plain words.
 */
export function chooseEngine(input: ChooseInput): EngineChoice {
  const { container, video, audio } = input;
  const allCopy = copies(video) && copies(audio);
  const videoName = video ? VIDEO_CODECS[video.to].label : "";
  const audioName = audio ? AUDIO_CODECS[audio.to].label : "";

  // Why the browser can't do it alone, if it can't.
  let blocker: string | null = null;
  if (!input.browserReads) blocker = "this browser can't read this kind of file";
  else if (!mediabunnyCanWrite(container)) blocker = "this browser can't write this format";
  else if (video && !copies(video)) {
    if (!video.canDecode) blocker = "this browser can't decode the video";
    else if (!VIDEO_CODECS[video.to].mb || !input.browserEncodes.video) {
      blocker = `this browser can't make ${videoName} video`;
    }
  }
  if (!blocker && audio && !copies(audio)) {
    if (!audio.canDecode) blocker = "this browser can't decode the sound";
    else if (!AUDIO_CODECS[audio.to].mb || !input.browserEncodes.audio) {
      blocker = `this browser can't make ${audioName} sound`;
    }
  }

  if (!blocker) {
    if (allCopy) {
      return {
        engine: "browser",
        copy: true,
        summary: "instant, no quality loss",
        reason: "The video and sound are copied as they are, just repackaged.",
      };
    }
    const kept = video && copies(video) ? "video" : audio && copies(audio) ? "sound" : null;
    return {
      engine: "browser",
      copy: false,
      summary: "fast",
      reason: `Uses this device's own ${video && !copies(video) ? "video" : "audio"} encoder.${kept ? ` The ${kept} is copied as is.` : ""}`,
    };
  }

  // The engine: check it can make the format and codecs, when we know what it supports.
  const support = input.engine;
  const engineMissing: string[] = [];
  if (support) {
    if (!support.muxers.has(ffmpegMuxer(container))) engineMissing.push("this format");
    if (video && !copies(video)) {
      const ff = VIDEO_CODECS[video.to].ff;
      if (!ff || !support.encoders.has(ff)) engineMissing.push(`${videoName} video`);
    }
    if (audio && !copies(audio)) {
      const ff = AUDIO_CODECS[audio.to].ff;
      if (!ff || !support.encoders.has(ff)) engineMissing.push(`${audioName} sound`);
    }
  } else {
    if (video && !copies(video) && !VIDEO_CODECS[video.to].ff)
      engineMissing.push(`${videoName} video`);
    if (audio && !copies(audio) && !AUDIO_CODECS[audio.to].ff)
      engineMissing.push(`${audioName} sound`);
  }
  if (engineMissing.length) {
    return {
      engine: null,
      copy: false,
      summary: "not possible here",
      reason: `${capitalize(blocker)}, and the video engine can't make ${engineMissing.join(" or ")} either.`,
    };
  }
  return {
    engine: "engine",
    copy: allCopy,
    summary: allCopy
      ? "no quality loss, needs the video engine"
      : "needs the video engine (slower)",
    reason: `${capitalize(blocker)}, so the video engine does it${allCopy ? ", copying the video and sound as they are" : ""}.`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
