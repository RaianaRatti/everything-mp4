import { QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_VERY_HIGH, type InputAudioTrack } from "mediabunny";
import { decodeRange } from "../../lib/audio/buffers";
import { drawComposite, type Layer } from "../../lib/compose";
import { renderVideo, type RenderResult } from "../../lib/engine/pipeline";
import type { Fit, Rect, Size } from "../../lib/layout";
import type { OutputTarget } from "../../lib/output";
import { openInput } from "../../lib/probe";

export interface ExportClip {
  file: File;
  start: number;
  end: number;
  volume: number;
  rect: Rect;
  fit: Fit;
}

export interface ExportOptions {
  /** In draw order: the first clip is at the bottom, the last on top. */
  clips: ExportClip[];
  size: Size;
  fps: number;
  quality: "medium" | "high" | "very-high";
  target: OutputTarget;
  signal: AbortSignal;
  onProgress: (progress: { phase: "audio" | "video"; fraction: number }) => void;
}

const SAMPLE_RATE = 48_000;

const QUALITIES = { medium: QUALITY_MEDIUM, high: QUALITY_HIGH, "very-high": QUALITY_VERY_HIGH };

/**
 * Renders the merged video: each clip's trimmed part plays from the start of the output, laid
 * out in its box; once a shorter one runs out its box stays black. Audio from all of them is
 * mixed at each clip's volume.
 */
export async function exportMerge(options: ExportOptions): Promise<RenderResult> {
  const { clips, signal, onProgress } = options;
  const duration = Math.max(0, ...clips.map((c) => c.end - c.start));

  onProgress({ phase: "audio", fraction: 0 });
  const mixed = await mixAudio(clips, duration, signal, (fraction) =>
    onProgress({ phase: "audio", fraction }),
  );

  return renderVideo({
    sources: clips.map(({ file, start, end }) => ({ file, start, end })),
    size: options.size,
    fps: options.fps,
    duration,
    quality: QUALITIES[options.quality],
    audio: mixed ? { kind: "buffer", buffer: mixed } : { kind: "none" },
    target: options.target,
    signal,
    onProgress: (fraction) => onProgress({ phase: "video", fraction }),
    draw: (ctx, { images, sizes }) => {
      const layers: Layer[] = clips.map((clip, i) => ({
        frame: images[i] ?? null,
        size: sizes[i]!,
        rect: clip.rect,
        fit: clip.fit,
      }));
      drawComposite(ctx, options.size, layers);
    },
  });
}

/**
 * Decodes the trimmed audio of each clip and mixes them into one stereo track the length of the
 * output, applying each clip's volume. Different sample rates and channel layouts are converted
 * by the browser's audio engine. Null when none of the videos has sound.
 */
async function mixAudio(
  clips: ExportClip[],
  duration: number,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<AudioBuffer | null> {
  const withAudio: { clip: ExportClip; track: InputAudioTrack; offset: number }[] = [];
  const inputs = [];
  let anySound = false;
  try {
    for (const clip of clips) {
      const input = openInput(clip.file);
      inputs.push(input);
      const track = await input.getPrimaryAudioTrack();
      if (!track) continue;
      // A video with sound keeps a (maybe silent) audio track, even when muted.
      anySound = true;
      if (clip.volume <= 0 || clip.end <= clip.start || !(await track.canDecode())) continue;
      const video = await input.getPrimaryVideoTrack();
      // Trim times count from where the video starts; see renderVideo.
      withAudio.push({ clip, track, offset: video ? await video.getFirstTimestamp() : 0 });
    }
    if (!anySound) return null;

    const context = new OfflineAudioContext(
      2,
      Math.max(1, Math.ceil(duration * SAMPLE_RATE)),
      SAMPLE_RATE,
    );
    for (const [index, { clip, track, offset }] of withAudio.entries()) {
      const decoded = await decodeRange(
        track,
        offset + clip.start,
        clip.end - clip.start,
        signal,
        (f) => onProgress((index + f) / withAudio.length),
      );
      if (!decoded) continue;
      const source = new AudioBufferSourceNode(context, { buffer: decoded });
      const gain = new GainNode(context, { gain: clip.volume });
      source.connect(gain).connect(context.destination);
      source.start(0);
    }
    return await context.startRendering();
  } finally {
    for (const input of inputs) input.dispose();
  }
}
