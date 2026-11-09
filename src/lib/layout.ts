export interface Size {
  width: number;
  height: number;
}

/** A box in the output frame, in fractions of the frame's width and height (0–1). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a video fills its box: whole video with black bars, cropped to fill, or stretched. */
export type Fit = "contain" | "cover" | "fill";

export type Preset = "overlay" | "side-by-side" | "stacked" | "grid";

export type Corner = "nw" | "ne" | "sw" | "se";

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

const MIN_SIZE = 0.05;
const SNAP = 0.015;

/** Picture-in-picture corners, in the order extra videos fill them. */
const PIP_CORNERS: Corner[] = ["se", "sw", "ne", "nw"];

/**
 * One box per video for a preset. For the overlay, the first video fills the frame and the rest
 * become corner pictures-in-picture sized to their own aspect ratio, so they show without black
 * bars; past four of them, they line up along the bottom instead.
 */
export function presetRects(preset: Preset, frame: Size, videos: readonly Size[]): Rect[] {
  const n = videos.length;
  switch (preset) {
    case "side-by-side":
      return videos.map((_, i) => ({ x: i / n, y: 0, w: 1 / n, h: 1 }));
    case "stacked":
      return videos.map((_, i) => ({ x: 0, y: i / n, w: 1, h: 1 / n }));
    case "grid": {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      return videos.map((_, i) => {
        const row = Math.floor(i / cols);
        // Center a part-filled last row.
        const inRow = row === rows - 1 ? n - row * cols : cols;
        const shift = (cols - inRow) / 2;
        return { x: (shift + (i % cols)) / cols, y: row / rows, w: 1 / cols, h: 1 / rows };
      });
    }
    case "overlay": {
      if (n === 0) return [];
      const pips = videos.slice(1);
      const margin = Math.min(frame.width, frame.height) * 0.04;
      const inCorners = pips.length <= PIP_CORNERS.length;
      const maxW = inCorners
        ? frame.width * 0.34
        : (frame.width - margin * (pips.length + 1)) / pips.length;
      const boxes = pips.map((video) => {
        const aspect = video.width && video.height ? video.width / video.height : 16 / 9;
        // Start at the widest allowed, then shrink if that would be too tall.
        let w = maxW;
        let h = w / aspect;
        if (h > frame.height * 0.5) {
          h = frame.height * 0.5;
          w = h * aspect;
        }
        return { w, h };
      });

      let right = frame.width - margin;
      const rects = boxes.map(({ w, h }, i) => {
        let x: number;
        let y: number;
        if (inCorners) {
          const corner = PIP_CORNERS[i]!;
          x = corner === "nw" || corner === "sw" ? margin : frame.width - w - margin;
          y = corner === "nw" || corner === "ne" ? margin : frame.height - h - margin;
        } else {
          x = right - w;
          y = frame.height - h - margin;
          right = x - margin;
        }
        return { x: x / frame.width, y: y / frame.height, w: w / frame.width, h: h / frame.height };
      });
      return [FULL, ...rects];
    }
  }
}

export interface DrawPlan {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Source and destination rectangles (in pixels) for drawing a video into a box. */
export function fitInto(source: Size, box: Rect, fit: Fit): DrawPlan {
  const full = { sx: 0, sy: 0, sw: source.width, sh: source.height };
  if (fit === "fill") return { ...full, dx: box.x, dy: box.y, dw: box.w, dh: box.h };

  const scale =
    fit === "contain"
      ? Math.min(box.w / source.width, box.h / source.height)
      : Math.max(box.w / source.width, box.h / source.height);

  if (fit === "contain") {
    const dw = source.width * scale;
    const dh = source.height * scale;
    return { ...full, dx: box.x + (box.w - dw) / 2, dy: box.y + (box.h - dh) / 2, dw, dh };
  }

  // Cover: crop the middle of the source so it exactly fills the box.
  const sw = box.w / scale;
  const sh = box.h / scale;
  return {
    sx: (source.width - sw) / 2,
    sy: (source.height - sh) / 2,
    sw,
    sh,
    dx: box.x,
    dy: box.y,
    dw: box.w,
    dh: box.h,
  };
}

/** Snaps a box edge to the frame's edges or center line when it's close. */
function snap(start: number, size: number): number {
  for (const target of [0, 1, 0.5]) {
    if (Math.abs(start - target) < SNAP) return target;
    if (Math.abs(start + size - target) < SNAP) return target - size;
    if (target === 0.5 && Math.abs(start + size / 2 - target) < SNAP) return target - size / 2;
  }
  return start;
}

/** Keeps a box's position within the frame (a box larger than the frame may hang over it). */
function clampAxis(start: number, size: number): number {
  const lo = Math.min(0, 1 - size);
  const hi = Math.max(0, 1 - size);
  return Math.min(hi, Math.max(lo, start));
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    ...rect,
    x: clampAxis(snap(rect.x + dx, rect.w), rect.w),
    y: clampAxis(snap(rect.y + dy, rect.h), rect.h),
  };
}

/**
 * Resizes a box by dragging one corner; the opposite corner stays put. With `keepAspect`, the
 * box keeps its starting proportions.
 */
export function resizeRect(
  rect: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  keepAspect: boolean,
): Rect {
  const left = corner === "nw" || corner === "sw";
  const top = corner === "nw" || corner === "ne";
  const anchorX = left ? rect.x + rect.w : rect.x;
  const anchorY = top ? rect.y + rect.h : rect.y;

  let w = Math.max(MIN_SIZE, rect.w + (left ? -dx : dx));
  let h = Math.max(MIN_SIZE, rect.h + (top ? -dy : dy));

  if (keepAspect) {
    const ratio = rect.w / rect.h;
    // Follow whichever direction the pointer moved further, relative to the box's size.
    if (Math.abs(w / rect.w - 1) >= Math.abs(h / rect.h - 1)) h = w / ratio;
    else w = h * ratio;
    if (h < MIN_SIZE) [h, w] = [MIN_SIZE, MIN_SIZE * ratio];
    if (w < MIN_SIZE) [w, h] = [MIN_SIZE, MIN_SIZE / ratio];
  }

  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h };
}

/** Rounds a dimension down to an even number of pixels, which H.264 requires. */
export function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}
