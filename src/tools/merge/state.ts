import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  even,
  FULL,
  presetRects,
  type Fit,
  type Preset,
  type Rect,
  type Size,
} from "../../lib/layout";
import type { VideoInfo } from "../../lib/probe";

/** A video's position in the clip list (0 is the first video). */
export type Slot = number;

export interface Clip {
  /** Stays the same when the video is replaced, so its layer and size choice carry over. */
  id: string;
  file: File;
  /** Object URL for previewing the file in a <video>. */
  url: string;
  info: VideoInfo;
  /** The part of the video to use, in seconds of the source. */
  start: number;
  end: number;
  /** 0 is silent, 1 is the original level, up to 2 for a boost. */
  volume: number;
  rect: Rect;
  fit: Fit;
}

/** "first" follows whichever video is first; `clip:<id>` follows one video. */
export type SizeChoice =
  "first" | `clip:${string}` | "1920x1080" | "1280x720" | "1080x1920" | "1080x1080" | "3840x2160";

export type FpsChoice = "source" | "24" | "25" | "30" | "60";

export type QualityChoice = "medium" | "high" | "very-high";

export interface MergeState {
  clips: Clip[];
  /** Clip ids from the bottom layer to the top one, for where boxes overlap. */
  order: string[];
  /** The video whose box the preview is showing handles for. */
  selected: Slot;
  /** The last layout preset applied, or "custom" once a box has been moved by hand. */
  layout: Preset | "custom";
  size: SizeChoice;
  fps: FpsChoice;
  quality: QualityChoice;

  addClips(videos: { file: File; info: VideoInfo }[]): void;
  replaceClip(slot: Slot, file: File, info: VideoInfo): void;
  removeClip(slot: Slot): void;
  updateClip(slot: Slot, patch: Partial<Pick<Clip, "start" | "end" | "volume" | "fit">>): void;
  setRect(slot: Slot, rect: Rect): void;
  applyLayout(preset: Preset): void;
  /** Moves a video one layer up (1) or down (-1). */
  moveLayer(slot: Slot, step: 1 | -1): void;
  select(slot: Slot): void;
  setSize(size: SizeChoice): void;
  setFps(fps: FpsChoice): void;
  setQuality(quality: QualityChoice): void;
}

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/** "first video", "second video", … */
export function videoName(slot: Slot): string {
  return `${ORDINALS[slot] ?? `#${slot + 1}`} video`;
}

/** The length of the used part of a clip, in seconds. */
export function clipLength(clip: Clip): number {
  return Math.max(0, clip.end - clip.start);
}

/** The merged video lasts as long as the longest part. */
export function outputDuration(clips: readonly Clip[]): number {
  return Math.max(0, ...clips.map(clipLength));
}

export function outputSize(state: Pick<MergeState, "clips" | "size">): Size {
  const { clips, size } = state;
  if (size === "first" || size.startsWith("clip:")) {
    const from = clips.find((c) => `clip:${c.id}` === size) ?? clips[0];
    return from
      ? { width: even(from.info.width), height: even(from.info.height) }
      : { width: 1920, height: 1080 };
  }
  const [w, h] = size.split("x").map(Number);
  return { width: w!, height: h! };
}

export function outputFps(state: Pick<MergeState, "clips" | "fps">): number {
  if (state.fps !== "source") return Number(state.fps);
  const measured = state.clips.find((c) => c.info.fps)?.info.fps;
  // Round to a sensible rate (29.97 stays 29.97; 29.9993 becomes 30) and keep it in range.
  return measured ? Math.min(60, Math.max(1, Math.round(measured * 100) / 100)) : 30;
}

/** Draw order for the composite, as slots: the bottom video first, the top one last. */
export function drawOrder(state: Pick<MergeState, "clips" | "order">): Slot[] {
  return state.order.map((id) => state.clips.findIndex((c) => c.id === id)).filter((i) => i >= 0);
}

/** Recomputes every box from a preset, using the current frame size and videos. */
function withLayout(
  state: Pick<MergeState, "clips" | "size">,
  preset: Preset,
): MergeState["clips"] {
  const rects = presetRects(
    preset,
    outputSize(state),
    state.clips.map((c) => c.info),
  );
  return state.clips.map((clip, i) => ({ ...clip, rect: rects[i] ?? FULL }));
}

function newClip(id: string, file: File, info: VideoInfo): Clip {
  return {
    id,
    file,
    url: URL.createObjectURL(file),
    info,
    start: 0,
    end: info.duration,
    volume: 1,
    rect: FULL,
    fit: "contain",
  };
}

let nextId = 0;

export const useMerge = create<MergeState>((set, get) => ({
  clips: [],
  order: [],
  selected: 0,
  layout: "overlay",
  size: "first",
  fps: "source",
  quality: "high",

  addClips(videos) {
    if (!videos.length) return;
    const state = get();
    const added = videos.map(({ file, info }) => newClip(String(nextId++), file, info));
    const clips = [...state.clips, ...added];
    const preset = state.layout === "custom" ? "overlay" : state.layout;
    set({
      clips: withLayout({ clips, size: state.size }, preset),
      // New videos go on top, and the last one added is ready to position.
      order: [...state.order, ...added.map((c) => c.id)],
      selected: clips.length - 1,
      layout: preset,
    });
  },

  replaceClip(slot, file, info) {
    const state = get();
    const old = state.clips[slot];
    if (!old) return;
    URL.revokeObjectURL(old.url);
    const clips = state.clips.with(slot, newClip(old.id, file, info));
    const preset = state.layout === "custom" ? "overlay" : state.layout;
    set({ clips: withLayout({ clips, size: state.size }, preset), layout: preset });
  },

  removeClip(slot) {
    const state = get();
    const old = state.clips[slot];
    if (!old) return;
    URL.revokeObjectURL(old.url);
    const clips = state.clips.filter((_, i) => i !== slot);
    // A size taken from the removed video, or from the one that's now first, becomes "first".
    const sizeFrom = clips.find((c) => `clip:${c.id}` === state.size);
    const size =
      state.size.startsWith("clip:") && (!sizeFrom || sizeFrom === clips[0]) ? "first" : state.size;
    set({
      clips: state.layout === "custom" ? clips : withLayout({ clips, size }, state.layout),
      order: state.order.filter((id) => id !== old.id),
      selected: Math.max(
        0,
        Math.min(state.selected > slot ? state.selected - 1 : state.selected, clips.length - 1),
      ),
      size,
    });
  },

  updateClip(slot, patch) {
    const clip = get().clips[slot];
    if (!clip) return;
    set({ clips: get().clips.with(slot, { ...clip, ...patch }) });
  },

  setRect(slot, rect) {
    const clip = get().clips[slot];
    if (!clip) return;
    set({ clips: get().clips.with(slot, { ...clip, rect }), layout: "custom" });
  },

  applyLayout(preset) {
    const state = get();
    set({
      clips: withLayout(state, preset),
      layout: preset,
      // In the overlay, the small pictures-in-picture have to be over the full-frame one.
      ...(preset === "overlay"
        ? {
            order: state.clips.map((c) => c.id),
            selected: state.selected === 0 ? Math.min(1, state.clips.length - 1) : state.selected,
          }
        : {}),
    });
  },

  moveLayer(slot, step) {
    const state = get();
    const id = state.clips[slot]?.id;
    const from = state.order.indexOf(id ?? "");
    const to = from + step;
    if (from < 0 || to < 0 || to >= state.order.length) return;
    const order = [...state.order];
    [order[from], order[to]] = [order[to]!, order[from]!];
    set({ order });
  },

  select(selected) {
    set({ selected });
  },

  setSize(size) {
    const state = get();
    set(
      state.layout === "custom"
        ? { size }
        : { size, clips: withLayout({ clips: state.clips, size }, state.layout) },
    );
  },

  setFps(fps) {
    set({ fps });
  },

  setQuality(quality) {
    set({ quality });
  },
}));

export function useOutputSize(): Size {
  return useMerge(useShallow((s) => outputSize(s)));
}
