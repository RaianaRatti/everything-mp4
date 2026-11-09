import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Span } from "../lib/ffmpeg/edit";
import { isTyping } from "../lib/keys";
import { formatTime } from "../lib/time";

/**
 * The shared editing timeline: a ruler, the playhead, ranges with drag handles, and markers.
 * Keys: I / O set the active range's in and out points, , and . step one frame, M adds a marker.
 * Each handle is also a slider (arrow keys move it; shift for whole seconds).
 */
export function Timeline({
  duration,
  time,
  onSeek,
  ranges = [],
  onRanges,
  active = 0,
  onActive,
  markers = [],
  onMarkers,
  fps = 30,
}: {
  duration: number;
  time: number;
  onSeek: (seconds: number) => void;
  ranges?: Span[];
  onRanges?: (ranges: Span[]) => void;
  active?: number;
  onActive?: (index: number) => void;
  markers?: number[];
  onMarkers?: (markers: number[]) => void;
  fps?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const latest = useRef({ ranges, active, time, markers, onRanges, onMarkers, onSeek });
  useEffect(() => {
    latest.current = { ranges, active, time, markers, onRanges, onMarkers, onSeek };
  });

  const clamp = (t: number) => Math.min(duration, Math.max(0, t));
  const at = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * duration);
  };
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const setEdge = (index: number, edge: "start" | "end", value: number) => {
    const { ranges: rs, onRanges: set } = latest.current;
    const r = rs[index];
    if (!r || !set) return;
    const next =
      edge === "start"
        ? { start: Math.min(clamp(value), r.end - 0.1), end: r.end }
        : { start: r.start, end: Math.max(clamp(value), r.start + 0.1) };
    set(rs.map((x, i) => (i === index ? next : x)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const { active: a, time: t, markers: ms, onMarkers: setMarkers, onSeek: seek } =
        latest.current;
      const key = e.key.toLowerCase();
      if (key === "i") setEdge(a, "start", t);
      else if (key === "o") setEdge(a, "end", t);
      else if (key === ",") seek(clamp(t - 1 / fps));
      else if (key === ".") seek(clamp(t + 1 / fps));
      else if (key === "m" && setMarkers) setMarkers([...ms, t].sort((x, y) => x - y));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, fps]);

  const drag = (onMove: (t: number) => void) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(at(ev.clientX));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const handle = (index: number, edge: "start" | "end") => {
    const value = ranges[index]![edge];
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${edge === "start" ? "start" : "end"} of part ${index + 1}`}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={value}
        aria-valuetext={formatTime(value)}
        onPointerDown={drag((t) => setEdge(index, edge, t))}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 1 / fps;
          if (e.key === "ArrowLeft") setEdge(index, edge, value - step);
          else if (e.key === "ArrowRight") setEdge(index, edge, value + step);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`absolute top-0 bottom-0 z-10 w-3 cursor-ew-resize bg-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
          edge === "start" ? "rounded-l-sm" : "-translate-x-full rounded-r-sm"
        }`}
        style={{ left: pct(value) }}
      />
    );
  };

  return (
    <div className="space-y-1 select-none">
      <div
        ref={track}
        onPointerDown={(e) => {
          onSeek(at(e.clientX));
          drag(onSeek)(e);
        }}
        className="relative h-14 cursor-pointer overflow-hidden rounded-md border-3 border-ink bg-paper-2"
      >
        {ranges.map((r, i) => (
          <div
            key={i}
            onPointerDown={(e) => {
              onActive?.(i);
              onSeek(at(e.clientX));
            }}
            className={`absolute top-0 bottom-0 ${i === active ? "bg-accent" : "bg-accent/50"}`}
            style={{ left: pct(r.start), width: pct(r.end - r.start) }}
          />
        ))}
        {onRanges && ranges.map((_, i) => [handle(i, "start"), handle(i, "end")])}
        {markers.map((m, i) => (
          <div
            key={`m${i}`}
            className="absolute top-0 bottom-0 w-0.5 bg-red-600"
            style={{ left: pct(m) }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-ink"
          style={{ left: pct(time) }}
        />
      </div>
      <div className="flex justify-between text-xs text-ink-3">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{formatTime(duration * f, 0)}</span>
        ))}
      </div>
      <p className="text-xs text-ink-3">
        click to move the playhead · I / O set the start and end · , and . step one frame
        {onMarkers ? " · M adds a marker" : ""}
      </p>
    </div>
  );
}
