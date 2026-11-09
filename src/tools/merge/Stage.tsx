import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { moveRect, resizeRect, type Corner, type Rect } from "../../lib/layout";
import { player } from "./player";
import { drawOrder, useMerge, useOutputSize, type Slot } from "./state";

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

// Stable ref callbacks per clip, so React only attaches each element once.
const videoRefs = new Map<string, (el: HTMLVideoElement) => () => void>();
function videoRef(id: string) {
  let ref = videoRefs.get(id);
  if (!ref) {
    ref = (el) => player.attachVideo(id, el);
    videoRefs.set(id, ref);
  }
  return ref;
}

const cornerClass: Record<Corner, string> = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
};

/** Largest box of the given aspect ratio that fits in the element. */
function useFittedBox(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      setBox({ width: Math.floor(w), height: Math.floor(w / aspect) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect]);
  return [ref, box] as const;
}

/**
 * The live preview of the merged video. Each video's box can be dragged to move it and resized
 * from its corners (proportions are kept unless Shift is held).
 */
export function Stage() {
  const clips = useMerge((s) => s.clips);
  const order = useMerge((s) => s.order);
  const selected = useMerge((s) => s.selected);
  const size = useOutputSize();
  const setRect = useMerge((s) => s.setRect);
  const select = useMerge((s) => s.select);
  const [container, box] = useFittedBox(size.width / size.height);
  const canvasRef = useCallback((el: HTMLCanvasElement) => player.attachCanvas(el), []);

  const startDrag = (e: ReactPointerEvent, slot: Slot, mode: "move" | Corner) => {
    const clip = clips[slot];
    if (!clip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select(slot);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const origin = { x: e.clientX, y: e.clientY, rect: clip.rect };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - origin.x) / box.width;
      const dy = (ev.clientY - origin.y) / box.height;
      const next: Rect =
        mode === "move"
          ? moveRect(origin.rect, dx, dy)
          : resizeRect(origin.rect, mode, dx, dy, !ev.shiftKey);
      setRect(slot, next);
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
    <div ref={container} className="flex h-[min(58vh,640px)] min-h-56 items-center justify-center">
      <div
        className="relative overflow-hidden rounded-md border-3 border-ink bg-black shadow-pop"
        style={{ width: box.width, height: box.height }}
      >
        <canvas ref={canvasRef} className="size-full" />

        {drawOrder({ clips, order }).map((slot) => {
          const clip = clips[slot]!;
          const isSelected = slot === selected;
          return (
            <div
              key={clip.id}
              role="button"
              tabIndex={-1}
              aria-label={`Video ${slot + 1} box`}
              onPointerDown={(e) => startDrag(e, slot, "move")}
              className={`absolute cursor-move touch-none ${
                isSelected
                  ? "z-10 outline-2 outline-accent"
                  : "outline-1 outline-white/40 outline-dashed hover:outline-white/80"
              }`}
              style={{
                left: `${clip.rect.x * 100}%`,
                top: `${clip.rect.y * 100}%`,
                width: `${clip.rect.w * 100}%`,
                height: `${clip.rect.h * 100}%`,
              }}
            >
              <span
                className={`absolute top-1 left-1 rounded-sm px-1.5 text-xs ${
                  isSelected ? "bg-accent text-ink" : "bg-black/60 text-white"
                }`}
              >
                {slot + 1}
              </span>
              {isSelected &&
                CORNERS.map((corner) => (
                  <span
                    key={corner}
                    onPointerDown={(e) => startDrag(e, slot, corner)}
                    className={`absolute size-3 touch-none rounded-[2px] border-2 border-ink bg-accent ${cornerClass[corner]}`}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {/* The source videos. Kept in the page (not display:none) so browsers keep decoding them. */}
      <div
        className="pointer-events-none fixed -left-[9999px] size-px overflow-hidden opacity-0"
        aria-hidden
      >
        {clips.map((clip) => (
          <video key={clip.url} ref={videoRef(clip.id)} src={clip.url} preload="auto" playsInline />
        ))}
      </div>
    </div>
  );
}
