import { describe, expect, it } from "vitest";
import { even, fitInto, moveRect, presetRects, resizeRect, type Rect } from "./layout";

const frame = { width: 1920, height: 1080 };
const wide = { width: 1920, height: 1080 };
const tall = { width: 1080, height: 1920 };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("presetRects", () => {
  it("puts the second video in the bottom-right corner at its own aspect ratio", () => {
    const [a, b] = presetRects("overlay", frame, [wide, tall]) as [Rect, Rect];
    expect(a).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const wPx = b.w * frame.width;
    const hPx = b.h * frame.height;
    expect(wPx / hPx).toBeCloseTo(1080 / 1920);
    expect(b.h).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(b.x + b.w).toBeLessThan(1);
    expect(b.y + b.h).toBeLessThan(1);
  });

  it("gives one box per video", () => {
    for (const preset of ["overlay", "side-by-side", "stacked", "grid"] as const) {
      for (let n = 0; n <= 9; n++) {
        expect(presetRects(preset, frame, Array(n).fill(wide))).toHaveLength(n);
      }
    }
  });

  it("puts extra overlay videos in separate corners, then in a row along the bottom", () => {
    for (const n of [5, 8]) {
      const pips = presetRects("overlay", frame, Array(n).fill(wide)).slice(1);
      for (const [i, a] of pips.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(1);
        expect(a.y + a.h).toBeLessThanOrEqual(1);
        for (const b of pips.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
    }
  });

  it("splits the frame for side-by-side and stacked", () => {
    expect(presetRects("side-by-side", frame, [wide, wide])[1]).toEqual({
      x: 0.5,
      y: 0,
      w: 0.5,
      h: 1,
    });
    expect(presetRects("stacked", frame, [wide, wide])[1]).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
    expect(presetRects("side-by-side", frame, [wide, wide, wide])[2]?.x).toBeCloseTo(2 / 3);
  });

  it("lays out a grid and centers a part-filled last row", () => {
    const rects = presetRects("grid", frame, [wide, wide, wide]);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(rects[1]).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(rects[2]).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
  });
});

describe("fitInto", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const wide = { width: 200, height: 100 };

  it("letterboxes with contain", () => {
    expect(fitInto(wide, box, "contain")).toEqual({
      sx: 0,
      sy: 0,
      sw: 200,
      sh: 100,
      dx: 0,
      dy: 25,
      dw: 100,
      dh: 50,
    });
  });

  it("crops the middle with cover", () => {
    expect(fitInto(wide, box, "cover")).toEqual({
      sx: 50,
      sy: 0,
      sw: 100,
      sh: 100,
      dx: 0,
      dy: 0,
      dw: 100,
      dh: 100,
    });
  });

  it("stretches with fill", () => {
    expect(fitInto(wide, box, "fill")).toMatchObject({ sw: 200, sh: 100, dw: 100, dh: 100 });
  });
});

describe("moveRect", () => {
  const r: Rect = { x: 0.5, y: 0.5, w: 0.3, h: 0.3 };

  it("keeps the box inside the frame", () => {
    expect(moveRect(r, 1, 1).x).toBeCloseTo(0.7);
    expect(moveRect(r, -1, -1)).toMatchObject({ x: 0, y: 0 });
  });

  it("snaps to the frame edges", () => {
    expect(moveRect(r, -0.49, 0).x).toBe(0);
    expect(moveRect(r, 0.195, 0).x).toBeCloseTo(0.7);
  });
});

describe("resizeRect", () => {
  const r: Rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };

  it("keeps the opposite corner fixed", () => {
    const out = resizeRect(r, "nw", -0.1, -0.1, false);
    expect(out.x + out.w).toBeCloseTo(0.6);
    expect(out.y + out.h).toBeCloseTo(0.4);
    expect(out.x).toBeCloseTo(0.1);
    expect(out.y).toBeCloseTo(0.1);
  });

  it("keeps proportions when asked", () => {
    const out = resizeRect(r, "se", 0.2, 0, true);
    expect(out.w / out.h).toBeCloseTo(2);
    expect(out).toMatchObject({ x: 0.2, y: 0.2 });
  });

  it("never shrinks below the minimum", () => {
    const out = resizeRect(r, "se", -1, -1, false);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });
});

describe("even", () => {
  it("rounds down to even pixels", () => {
    expect(even(1081)).toBe(1080);
    expect(even(1080)).toBe(1080);
    expect(even(1)).toBe(2);
  });
});
