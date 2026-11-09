import { AudioLines, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { isTyping } from "../lib/keys";
import { FileActions } from "./FileActions";
import { formatTime } from "../lib/time";

type Props = {
  src: string;
  kind?: "video" | "audio";
  /** Receives the underlying element, for tools that seek or grab frames. */
  mediaRef?: RefObject<HTMLVideoElement | null>;
  range?: { start: number; end: number };
  playbackRate?: number;
  /** Shown instead of the player when the browser can't play the file. */
  fallback?: ReactNode;
  onTime?: (seconds: number) => void;
  muted?: boolean;
  /** A shorter player, for result previews in dialogs. */
  small?: boolean;
  /** Shows a bin in the corner (next to the tool's replace/add button, if any). */
  onRemove?: () => void;
};

/**
 * Plays a video or audio file with the same controls as merge: a play button, the time, and a
 * playhead slider. Space plays and pauses. With `range`, playback loops inside that part.
 */
export function MediaPreview(props: Props) {
  // A new file starts fresh: stopped, at 0, and not marked as unplayable.
  return <Player key={props.src} {...props} />;
}

function Player({
  src,
  kind = "video",
  mediaRef,
  range,
  playbackRate = 1,
  fallback,
  onTime,
  muted = false,
  small = false,
  onRemove,
}: Props) {
  const local = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [silent, setSilent] = useState(muted);
  // Set on the element directly: React doesn't always apply the muted attribute.
  useEffect(() => {
    if (!local.current) return;
    local.current.muted = silent;
    if (!silent) local.current.volume = 1;
  }, [silent, failed]);
  const rangeRef = useRef(range);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    rangeRef.current = range;
    onTimeRef.current = onTime;
  });

  const setRef = (el: HTMLVideoElement | null) => {
    local.current = el;
    if (mediaRef) mediaRef.current = el;
  };

  useEffect(() => {
    if (local.current) local.current.playbackRate = playbackRate;
  }, [playbackRate, src]);

  // Follow the playhead every frame while playing (timeupdate only fires a few times a second).
  useEffect(() => {
    const el = local.current;
    if (!el) return;
    let frame = 0;
    const tick = () => {
      const r = rangeRef.current;
      if (r && !el.paused && el.currentTime >= r.end - 0.01) el.currentTime = r.start;
      setTime(el.currentTime);
      onTimeRef.current?.(el.currentTime);
      if (!el.paused) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      const r = rangeRef.current;
      if (r && (el.currentTime < r.start || el.currentTime >= r.end - 0.01)) {
        el.currentTime = r.start;
      }
      frame = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      tick();
    };
    const onLoaded = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      el.playbackRate = playbackRate;
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("seeked", tick);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onLoaded);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("seeked", tick);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onLoaded);
    };
    // playbackRate is applied by its own effect; this only wires up the element once per file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, failed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target) || !local.current) return;
      e.preventDefault();
      toggle(local.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (failed) {
    return (
      fallback ?? (
        <div className="rounded-md border-3 border-ink bg-card p-5 text-sm text-ink-2">
          This browser can't play this file, but the tools may still be able to work with it.
        </div>
      )
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={
          kind === "video"
            ? `relative flex ${small ? "h-[min(40vh,320px)]" : "h-[min(52vh,560px)]"} min-h-48 items-center justify-center overflow-hidden rounded-md border-3 border-ink bg-black shadow-pop`
            : "relative flex h-28 items-center justify-center rounded-md border-3 border-ink bg-card shadow-pop"
        }
      >
        {kind === "audio" && <AudioLines className="size-10 text-ink-3" aria-hidden />}
        {!small && <FileActions onRemove={onRemove} className="absolute top-2 right-2 z-10" />}
        <video
          ref={setRef}
          src={src}
          preload="auto"
          playsInline
          muted={silent}
          // Previews start over at the end; with a range, the range loop above handles it.
          loop={!range}
          onClick={(e) => toggle(e.currentTarget)}
          onError={() => setFailed(true)}
          className={kind === "video" ? "max-h-full max-w-full" : "hidden"}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => local.current && toggle(local.current)}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (space)" : "Play (space)"}
          className="pop-press flex size-10 shrink-0 items-center justify-center rounded-md border-3 border-ink bg-ink text-paper shadow-pop-sm"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <span className="w-32 shrink-0 text-sm tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          aria-label="Playhead"
          min={0}
          max={duration || 1}
          step={0.01}
          value={time}
          onChange={(e) => {
            if (!local.current) return;
            local.current.currentTime = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
          className="w-full accent-black"
        />
        <button
          type="button"
          onClick={() => setSilent(!silent)}
          aria-label={silent ? "Unmute" : "Mute"}
          aria-pressed={silent}
          title={silent ? "Unmute" : "Mute"}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border-3 border-ink bg-card hover:bg-accent"
        >
          {silent ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>
    </div>
  );
}

function toggle(el: HTMLMediaElement) {
  if (el.paused) void el.play().catch(() => {});
  else el.pause();
}
