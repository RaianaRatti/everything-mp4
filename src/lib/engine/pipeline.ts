import {
  AudioBufferSource,
  CanvasSink,
  CanvasSource,
  Conversion,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Output,
  QUALITY_HIGH,
  type Input,
  type InputVideoTrack,
  type Quality,
  type VideoCodec,
  type WrappedCanvas,
} from "mediabunny";
import { sliceAudio } from "../audio/buffers";
import { FriendlyError } from "../errors";
import type { Size } from "../layout";
import { MEMORY, mediabunnyTarget, type OutputTarget } from "../output";
import { openInput } from "../probe";
import { mediabunnyFormat, type ContainerId } from "./formats";

export type Context2D = OffscreenCanvasRenderingContext2D;

export interface PipelineSource {
  file: File;
  /** The part to use, in seconds of the source, where 0 is the start of its video. */
  start: number;
  end: number;
}

/** What happens to the sound: none, a buffer the tool made, or one source's audio kept as is. */
export type AudioPlan =
  { kind: "none" } | { kind: "buffer"; buffer: AudioBuffer } | { kind: "copy"; source: number };

export interface FrameInfo {
  /** Output time of this frame, in seconds. */
  time: number;
  index: number;
  /** Each source's frame at this time, or null once its part has ended. */
  images: (CanvasImageSource | null)[];
  /** Each source's display size. */
  sizes: Size[];
}

export interface RenderOptions {
  sources: PipelineSource[];
  size: Size;
  fps: number;
  /** Output length in seconds. Defaults to the longest source part. */
  duration?: number;
  /** Draws one output frame. Shared with the tool's live preview, so the two always match. */
  draw: (ctx: Context2D, frame: FrameInfo) => void | Promise<void>;
  audio: AudioPlan;
  quality?: Quality | number;
  videoCodecs?: VideoCodec[];
  container?: Extract<ContainerId, "mp4" | "mov" | "webm" | "mkv">;
  target?: OutputTarget;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

export interface RenderResult {
  blob: Blob;
  /** Set when the result had to be made differently than asked (e.g. without sound). */
  warning?: string;
}

/** Seconds of audio handed to the muxer ahead of the video, so it can interleave the two. */
const AUDIO_AHEAD = 2;

const MIME = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

interface OpenSource extends PipelineSource {
  input: Input;
  track: InputVideoTrack;
  /**
   * Source timestamp that the <video> element (and our trim times) call 0: where the video starts.
   * Audio often starts a little earlier (AAC priming), so the file's earliest timestamp would
   * shift every frame.
   */
  offset: number;
  length: number;
  size: Size;
  frames: AsyncGenerator<WrappedCanvas | null, void, unknown> | null;
}

/** Opens a video for decoding, with plain errors for files this browser can't handle. */
export async function openVideo(file: File): Promise<{ input: Input; track: InputVideoTrack }> {
  const input = openInput(file);
  const track = await input.getPrimaryVideoTrack().catch(() => null);
  if (!track) {
    input.dispose();
    throw new FriendlyError(`${file.name} has no video this browser can read.`);
  }
  if (!(await track.canDecode())) {
    input.dispose();
    throw new FriendlyError(
      `Couldn't open the video in ${file.name}.`,
    );
  }
  return { input, track };
}

/**
 * The frame pipeline most tools share: decodes each source's part frame by frame, lets the tool
 * draw every output frame on a canvas, and encodes the result with the browser's (usually
 * hardware) video encoder. The sound is left out, encoded from a buffer, or copied from a source
 * without re-encoding when the format allows.
 */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { size, fps, signal, onProgress, draw } = options;
  const container = options.container ?? "mp4";
  const target = options.target ?? MEMORY;
  const quality = options.quality ?? QUALITY_HIGH;
  const opened: OpenSource[] = [];
  let output: Output | null = null;
  let abortTarget = async () => {};

  try {
    for (const source of options.sources) {
      const { input, track } = await openVideo(source.file);
      opened.push({
        ...source,
        input,
        track,
        offset: await track.getFirstTimestamp(),
        length: Math.max(0, source.end - source.start),
        size: { width: await track.getDisplayWidth(), height: await track.getDisplayHeight() },
        frames: null,
      });
    }

    const duration = options.duration ?? Math.max(0, ...opened.map((s) => s.length));
    const frameCount = Math.max(1, Math.ceil(duration * fps - 1e-6));
    const format = mediabunnyFormat(container, target.kind === "disk" ? "reserve" : "in-memory");

    const videoCodec = await getFirstEncodableVideoCodec(
      (options.videoCodecs ?? ["avc", "hevc", "vp9", "av1"]).filter((c) =>
        format.getSupportedCodecs().includes(c),
      ),
      { width: size.width, height: size.height, bitrate: quality, frameRate: fps },
    );
    if (!videoCodec) {
      throw new FriendlyError(
        `This browser can't encode ${size.width}×${size.height} video. Try a smaller size, or Chrome, Edge or Safari.`,
      );
    }

    const sink = await mediabunnyTarget(target, MIME[container]);
    abortTarget = sink.abort;
    output = new Output({ format, target: sink.target });

    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new FriendlyError("This browser can't draw video frames.");
    const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: quality });
    output.addVideoTrack(videoSource, { frameRate: fps, maximumPacketCount: frameCount + 10 });

    let warning: string | undefined;
    let audioSource: AudioBufferSource | null = null;
    let buffer: AudioBuffer | null = null;
    let copy: Conversion | null = null;

    if (options.audio.kind === "buffer") {
      const codec = await getFirstEncodableAudioCodec(
        (["aac", "opus"] as const).filter((c) => format.getSupportedCodecs().includes(c)),
        {
          numberOfChannels: options.audio.buffer.numberOfChannels,
          sampleRate: options.audio.buffer.sampleRate,
        },
      );
      if (codec) {
        buffer = options.audio.buffer;
        audioSource = new AudioBufferSource({ codec, bitrate: quality });
        // Generous: AAC and Opus both use under 50 packets a second.
        output.addAudioTrack(audioSource, { maximumPacketCount: Math.ceil(duration * 50) + 100 });
      } else {
        warning = "This browser can't encode audio, so the result has no sound.";
      }
    } else if (options.audio.kind === "copy") {
      const source = opened[options.audio.source];
      if (source && (await source.input.getPrimaryAudioTrack())) {
        copy = await Conversion.init({
          input: source.input,
          output,
          composable: true,
          tracks: "primary",
          video: { discard: true },
          trim: { start: source.offset + source.start, end: source.offset + source.end },
          showWarnings: false,
        });
        if (!copy.utilizedTracks.length) {
          copy = null;
          warning = "This browser can't keep this file's sound, so the result has no sound.";
        }
      }
    }

    await output.start();

    for (const source of opened) {
      const canvases = new CanvasSink(source.track, { poolSize: 2 });
      const count = Math.ceil(source.length * fps - 1e-6);
      const base = source.offset + source.start;
      source.frames = canvases.canvasesAtTimestamps(
        (function* () {
          // A hair past each frame time, so rounding never picks the previous frame.
          for (let i = 0; i < count; i++) yield base + i / fps + 1e-4;
        })(),
      );
    }

    let audioSent = 0;
    const sendAudio = async (until: number) => {
      if (buffer && audioSource) {
        const end = Math.min(buffer.length, Math.ceil(until * buffer.sampleRate));
        while (audioSent < end) {
          const length = Math.min(AUDIO_AHEAD * buffer.sampleRate, end - audioSent);
          await audioSource.add(sliceAudio(buffer, audioSent, length));
          audioSent += length;
        }
      }
      if (copy) await copy.execute({ until });
    };

    const sizes = opened.map((s) => s.size);
    for (let i = 0; i < frameCount; i++) {
      if (signal.aborted) throw signal.reason;
      const time = i / fps;
      await sendAudio(time + AUDIO_AHEAD);

      const images: (CanvasImageSource | null)[] = [];
      for (const source of opened) {
        let frame: WrappedCanvas | null = null;
        if (time < source.length && source.frames) {
          const next = await source.frames.next();
          if (next.done) source.frames = null;
          else frame = next.value;
        }
        images.push(frame?.canvas ?? null);
      }
      await draw(ctx, { time, index: i, images, sizes });
      await videoSource.add(time, 1 / fps);
      onProgress((i + 1) / frameCount);
    }

    await sendAudio(Infinity);
    videoSource.close();
    audioSource?.close();
    await output.finalize();
    return { blob: await sink.finish(), warning };
  } catch (err) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => {});
    }
    await abortTarget();
    throw err;
  } finally {
    for (const source of opened) {
      await source.frames?.return();
      source.input.dispose();
    }
  }
}
