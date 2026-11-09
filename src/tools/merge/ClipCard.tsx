import { Plus, RefreshCw, Trash2, Volume2, VolumeX } from "lucide-react";
import { type PointerEvent as ReactPointerEvent } from "react";
import { FilePickerButton } from "../../components/FileDrop";
import { TimeInput } from "../../components/TimeInput";
import { formatTime } from "../../lib/time";
import { player, usePlayback } from "./player";
import { clipLength, useMerge, type Clip, type Slot } from "./state";

/** Shortest part of a video that can be used, in seconds. */
const MIN_LENGTH = 0.1;

export const VIDEO_ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv";

/** One video's settings: which part of it to use and how loud it is. */
export function ClipCard({
  slot,
  clip,
  onReplace,
  onAdd,
}: {
  slot: Slot;
  clip: Clip;
  onReplace: (files: File[]) => void;
  onAdd: (files: File[]) => void;
}) {
  const updateClip = useMerge((s) => s.updateClip);
  const removeClip = useMerge((s) => s.removeClip);
  const select = useMerge((s) => s.select);
  const selected = useMerge((s) => s.selected === slot);
  const { duration } = clip.info;

  const setStart = (value: number) => {
    const start = Math.min(Math.max(0, value), clip.end - MIN_LENGTH);
    updateClip(slot, { start });
    player.peek(slot, start);
  };
  const setEnd = (value: number) => {
    const end = Math.max(Math.min(duration, value), clip.start + MIN_LENGTH);
    updateClip(slot, { end });
    player.peek(slot, end);
  };

  return (
    <section
      onPointerDown={() => select(slot)}
      aria-label={`Video ${slot + 1}`}
      className={`space-y-4 rounded-lg border-2 border-ink bg-card p-4 ${selected ? "shadow-pop" : ""}`}
    >
      <header className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-sm">
          {slot + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate" title={clip.file.name}>
            {clip.file.name}
          </p>
          <p className="text-xs text-ink-3">
            {formatTime(duration)} · {clip.info.width}×{clip.info.height}
            {clip.info.fps ? ` · ${Math.round(clip.info.fps * 100) / 100} fps` : ""}
            {clip.info.hasAudio ? "" : " · no audio"}
          </p>
          {!clip.info.canDecode && (
            <p className="mt-1 text-xs text-red-700">
              This browser can't decode this video for export. Try Chrome, Edge or Safari.
            </p>
          )}
        </div>
        <FilePickerButton
          onFiles={onAdd}
          multiple
          accept={VIDEO_ACCEPT}
          bare
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <Plus className="size-4" aria-label="Add videos" />
        </FilePickerButton>
        <FilePickerButton
          onFiles={onReplace}
          accept={VIDEO_ACCEPT}
          bare
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <RefreshCw className="size-4" aria-label="Replace video" />
        </FilePickerButton>
        <button
          type="button"
          onClick={() => removeClip(slot)}
          className="rounded-md p-1.5 hover:bg-red-50 hover:text-red-700"
          aria-label="Remove video"
          title="Remove video"
        >
          <Trash2 className="size-4" />
        </button>
      </header>

      <div className="space-y-2">
        <p className="text-xs tracking-wide text-ink-3 uppercase">part to use</p>
        <TrimBar slot={slot} clip={clip} onStart={setStart} onEnd={setEnd} />
        <div className="flex flex-wrap items-end gap-3">
          <TimeInput label="from" value={clip.start} onCommit={setStart} />
          <TimeInput label="to" value={clip.end} onCommit={setEnd} />
          <p className="pb-2 text-sm text-ink-2">= {formatTime(clipLength(clip))}</p>
          {(clip.start > 0 || clip.end < duration) && (
            <button
              type="button"
              onClick={() => updateClip(slot, { start: 0, end: duration })}
              className="pb-2 text-sm text-ink-3 underline hover:text-ink"
            >
              use all
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs tracking-wide text-ink-3 uppercase">volume</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!clip.info.hasAudio}
            onClick={() => updateClip(slot, { volume: clip.volume > 0 ? 0 : 1 })}
            aria-label={clip.volume > 0 ? "Mute" : "Unmute"}
            title={clip.volume > 0 ? "Mute" : "Unmute"}
            className="rounded-md p-1.5 hover:bg-accent disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            {clip.volume > 0 && clip.info.hasAudio ? (
              <Volume2 className="size-5" />
            ) : (
              <VolumeX className="size-5" />
            )}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={200}
            step={1}
            disabled={!clip.info.hasAudio}
            value={Math.round(clip.volume * 100)}
            onChange={(e) => updateClip(slot, { volume: Number(e.target.value) / 100 })}
            onDoubleClick={() => updateClip(slot, { volume: 1 })}
            className="w-full accent-black disabled:opacity-40"
          />
          <span className="w-12 shrink-0 text-right text-sm tabular-nums">
            {clip.info.hasAudio ? `${Math.round(clip.volume * 100)}%` : "—"}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * The whole source video as a bar, with the used part highlighted. Drag either handle to trim,
 * or drag the highlighted part to slide it along the video.
 */
function TrimBar({
  slot,
  clip,
  onStart,
  onEnd,
}: {
  slot: Slot;
  clip: Clip;
  onStart: (seconds: number) => void;
  onEnd: (seconds: number) => void;
}) {
  const updateClip = useMerge((s) => s.updateClip);
  const time = usePlayback((s) => s.time);
  const { duration } = clip.info;
  const at = (seconds: number) => `${(seconds / duration) * 100}%`;
  const playhead = clip.start + time;

  const drag = (e: ReactPointerEvent<HTMLElement>, mode: "start" | "end" | "range") => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = e.currentTarget.closest("[data-track]")!.getBoundingClientRect();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const origin = { x: e.clientX, start: clip.start, end: clip.end };
    const length = origin.end - origin.start;

    const onMove = (ev: PointerEvent) => {
      const seconds = ((ev.clientX - track.left) / track.width) * duration;
      if (mode === "start") onStart(seconds);
      else if (mode === "end") onEnd(seconds);
      else {
        const shift = ((ev.clientX - origin.x) / track.width) * duration;
        const start = Math.min(Math.max(0, origin.start + shift), duration - length);
        updateClip(slot, { start, end: start + length });
        player.peek(slot, start);
      }
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  return (
    <div data-track className="relative h-9 rounded-md border-2 border-ink bg-paper-3 select-none">
      <div
        onPointerDown={(e) => drag(e, "range")}
        className="absolute inset-y-0 cursor-grab touch-none bg-accent active:cursor-grabbing"
        style={{ left: at(clip.start), right: `calc(100% - ${at(clip.end)})` }}
      />
      {playhead < clip.end && (
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink"
          style={{ left: at(playhead) }}
          aria-hidden
        />
      )}
      {(["start", "end"] as const).map((handle) => (
        <div
          key={handle}
          role="slider"
          tabIndex={0}
          aria-label={handle === "start" ? "Start of the part" : "End of the part"}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={handle === "start" ? clip.start : clip.end}
          aria-valuetext={formatTime(handle === "start" ? clip.start : clip.end)}
          onPointerDown={(e) => drag(e, handle)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1;
            const delta = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
            if (!delta) return;
            e.preventDefault();
            if (handle === "start") onStart(clip.start + delta);
            else onEnd(clip.end + delta);
          }}
          className="absolute -inset-y-1.5 w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded-sm border-2 border-ink bg-card focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
          style={{ left: at(handle === "start" ? clip.start : clip.end) }}
        />
      ))}
    </div>
  );
}
