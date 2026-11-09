import {
  Conversion,
  Output,
  type InputAudioTrack,
  type InputVideoTrack,
  type MetadataTags,
} from "mediabunny";
import { FriendlyError } from "../errors";
import type { Size } from "../layout";
import { mediabunnyTarget, type OutputTarget } from "../output";
import { openInput } from "../probe";
import { ensureEncoders } from "./capabilities";
import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  mediabunnyFormat,
  type AudioCodecId,
  type ContainerId,
  type VideoCodecId,
} from "./formats";

export interface BrowserTranscode {
  file: File;
  container: ContainerId;
  mime: string;
  /** Null drops the video. */
  video: {
    codec: VideoCodecId;
    bitrate?: number;
    size?: Size;
    frameRate?: number;
    /** Re-encode even when the video could be copied (e.g. to compress it). */
    forceTranscode?: boolean;
  } | null;
  /** Null drops the sound. */
  audio: {
    codec: AudioCodecId;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    forceTranscode?: boolean;
    /** Which audio track (1-based) to use; defaults to the main one. */
    track?: number;
  } | null;
  /** Part to keep, in seconds from the start of the file. */
  trim?: { start: number; end: number };
  tags?: MetadataTags;
  target: OutputTarget;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

/**
 * Converts a file with the browser: streams are copied when nothing about them changes, otherwise
 * decoded and re-encoded with WebCodecs (usually hardware accelerated).
 */
export async function transcodeInBrowser(
  job: BrowserTranscode,
): Promise<{ blob: Blob; warnings: string[] }> {
  if (job.audio) await ensureEncoders();
  const input = openInput(job.file);
  const sink = await mediabunnyTarget(job.target, job.mime);
  const output = new Output({
    format: mediabunnyFormat(job.container, job.target.kind === "disk" ? "reserve" : "in-memory"),
    target: sink.target,
  });
  const warnings: string[] = [];
  const onAbort = () => void conversion?.cancel();
  let conversion: Conversion | null = null;

  try {
    const primaryVideo = await input.getPrimaryVideoTrack();
    const audioTracks = await input.getAudioTracks();
    const wantedAudio: InputAudioTrack | null =
      (job.audio?.track ? audioTracks.find((t) => t.number === job.audio!.track) : null) ??
      (await input.getPrimaryAudioTrack());
    // Times in the app count from where the video starts (like the <video> element).
    const offset = primaryVideo ? Math.max(0, await primaryVideo.getFirstTimestamp()) : 0;

    conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: (track: InputVideoTrack) => {
        if (!job.video || track !== primaryVideo) return { discard: true };
        const v = job.video;
        return {
          codec: VIDEO_CODECS[v.codec].mb ?? undefined,
          bitrate: v.bitrate,
          width: v.size?.width,
          height: v.size?.height,
          fit: v.size ? "fill" : undefined,
          frameRate: v.frameRate,
          forceTranscode: v.forceTranscode,
        };
      },
      audio: (track: InputAudioTrack) => {
        if (!job.audio || track !== wantedAudio) return { discard: true };
        const a = job.audio;
        return {
          codec: AUDIO_CODECS[a.codec].mb ?? undefined,
          bitrate: a.bitrate,
          sampleRate: a.sampleRate,
          numberOfChannels: a.channels,
          forceTranscode: a.forceTranscode,
        };
      },
      trim: job.trim ? { start: offset + job.trim.start, end: offset + job.trim.end } : undefined,
      tags: job.tags ? (existing) => ({ ...existing, ...job.tags }) : undefined,
    });

    const lost = (type: "video" | "audio") =>
      conversion!.discardedTracks.find(
        (d) => d.track.type === type && d.reason !== "discarded_by_user",
      );
    if (job.video && primaryVideo && lost("video")) {
      throw new FriendlyError(
        `This browser can't convert the video in ${job.file.name}. Try another format or codec.`,
      );
    }
    if (job.audio && wantedAudio && lost("audio")) {
      if (!job.video) {
        throw new FriendlyError(`This browser can't convert the sound in ${job.file.name}.`);
      }
      warnings.push("This browser couldn't convert the sound, so the result is silent.");
    }
    if (!conversion.isValid) {
      throw new FriendlyError(
        `There's nothing in ${job.file.name} that can be converted this way.`,
      );
    }

    job.signal.addEventListener("abort", onAbort);
    conversion.onProgress = (p) => job.onProgress(p);
    await conversion.execute();
    if (job.signal.aborted) throw job.signal.reason;
    return { blob: await sink.finish(), warnings };
  } catch (err) {
    if (output.state !== "finalized" && output.state !== "canceled")
      await output.cancel().catch(() => {});
    await sink.abort();
    if (job.signal.aborted) throw job.signal.reason;
    throw err;
  } finally {
    job.signal.removeEventListener("abort", onAbort);
    input.dispose();
  }
}
