import { create } from "zustand";
import { drawComposite, type Layer } from "../../lib/compose";
import { clipLength, drawOrder, outputDuration, outputSize, useMerge, type Slot } from "./state";

/** The preview's playhead, in seconds of the merged video. */
export const usePlayback = create<{ time: number; playing: boolean }>(() => ({
  time: 0,
  playing: false,
}));

/** How far a video may drift from the shared clock before it gets nudged back. */
const MAX_DRIFT = 0.25;

/**
 * Plays all the videos in step from a shared clock and paints the merged frame onto a canvas, using
 * the same drawing code as the export. Volume runs through Web Audio so it can go above 100%.
 */
class Player {
  /** Preview <video> elements by clip id. */
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private audio: AudioContext | null = null;
  private gains = new WeakMap<HTMLVideoElement, GainNode>();
  private clockStart = 0;
  private timeAtStart = 0;
  private frame = 0;

  /** Registers a preview <video>; returns the cleanup for a React ref callback. */
  attachVideo(id: string, video: HTMLVideoElement) {
    const onSeeked = () => this.draw();
    const onLoaded = () => this.seek(usePlayback.getState().time);
    this.videos.set(id, video);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onLoaded);
    return () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onLoaded);
      if (this.videos.get(id) === video) this.videos.delete(id);
    };
  }

  /** Registers the preview canvas and starts painting it; returns the cleanup. */
  attachCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    cancelAnimationFrame(this.frame);
    this.loop();
    return () => {
      cancelAnimationFrame(this.frame);
      if (this.canvas === canvas) this.canvas = null;
    };
  }

  play() {
    const duration = outputDuration(useMerge.getState().clips);
    if (duration <= 0) return;
    let { time } = usePlayback.getState();
    if (time >= duration - 0.05) time = 0;
    this.ensureAudio();
    this.timeAtStart = time;
    this.clockStart = performance.now();
    usePlayback.setState({ playing: true, time });
    this.sync(time, true);
  }

  pause() {
    for (const v of this.videos.values()) v.pause();
    usePlayback.setState({ playing: false });
  }

  toggle() {
    if (usePlayback.getState().playing) this.pause();
    else this.play();
  }

  seek(time: number) {
    const duration = outputDuration(useMerge.getState().clips);
    const t = Math.min(Math.max(0, time), duration);
    this.timeAtStart = t;
    this.clockStart = performance.now();
    usePlayback.setState({ time: t });
    this.sync(t, true);
    this.draw();
  }

  /** Shows the frame at a point of one video's source (used while dragging its trim handles). */
  peek(slot: Slot, sourceTime: number) {
    const clip = useMerge.getState().clips[slot];
    if (!clip) return;
    this.pause();
    this.seek(Math.min(sourceTime - clip.start, clipLength(clip) - 0.001));
  }

  private ensureAudio() {
    if (!this.audio) this.audio = new AudioContext();
    void this.audio.resume();
    for (const video of this.videos.values()) {
      if (this.gains.has(video)) continue;
      const gain = this.audio.createGain();
      this.audio.createMediaElementSource(video).connect(gain).connect(this.audio.destination);
      this.gains.set(video, gain);
    }
  }

  /** Puts each video at the right point of its trimmed range and plays or pauses it. */
  private sync(time: number, force: boolean) {
    const { clips } = useMerge.getState();
    const { playing } = usePlayback.getState();
    for (const clip of clips) {
      const video = this.videos.get(clip.id);
      if (!video || video.readyState < 1) continue;
      const gain = this.gains.get(video);
      if (gain) gain.gain.value = clip.volume;
      else video.volume = Math.min(1, clip.volume);

      const length = clipLength(clip);
      if (time >= length) {
        if (!video.paused) video.pause();
        continue;
      }
      const target = clip.start + time;
      if (force || Math.abs(video.currentTime - target) > MAX_DRIFT) video.currentTime = target;
      if (playing && video.paused) void video.play().catch(() => {});
      if (!playing && !video.paused) video.pause();
    }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const { playing } = usePlayback.getState();
    if (playing) {
      const duration = outputDuration(useMerge.getState().clips);
      let time = this.timeAtStart + (performance.now() - this.clockStart) / 1000;
      if (time >= duration) {
        time = duration;
        this.pause();
      }
      usePlayback.setState({ time });
      this.sync(time, false);
    }
    this.draw();
  };

  draw() {
    const canvas = this.canvas;
    if (!canvas) return;
    const state = useMerge.getState();
    const size = outputSize(state);
    // Draw at the canvas' on-screen resolution, not the export size, to keep the preview cheap.
    const scale = Math.min(1, (canvas.clientWidth * devicePixelRatio) / size.width);
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const { time } = usePlayback.getState();
    const layers: Layer[] = [];
    for (const slot of drawOrder(state)) {
      const clip = state.clips[slot]!;
      const video = this.videos.get(clip.id);
      const showing = video && video.readyState >= 2 && time < clipLength(clip);
      layers.push({
        frame: showing ? video : null,
        size: { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 },
        rect: clip.rect,
        fit: clip.fit,
      });
    }
    drawComposite(ctx, { width, height }, layers);
  }
}

export const player = new Player();
