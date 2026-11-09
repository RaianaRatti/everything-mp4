import { describe, expect, it } from "vitest";
import { MAX_FRAMES, frameTimes, timeLabel } from "./extract";

describe("frameTimes", () => {
  it("takes a frame every N seconds", () => {
    expect(frameTimes({ kind: "every", seconds: 2 }, 7, 30)).toEqual([0, 2, 4, 6]);
  });

  it("spreads N frames evenly", () => {
    expect(frameTimes({ kind: "count", count: 4 }, 8, 30)).toEqual([1, 3, 5, 7]);
  });

  it("takes every frame in a range, up to a limit", () => {
    const times = frameTimes({ kind: "all", start: 1, end: 2 }, 10, 25);
    expect(times).toHaveLength(25);
    expect(times[0]).toBe(1);
    expect(frameTimes({ kind: "all", start: 0, end: 3600 }, 3600, 60)).toHaveLength(MAX_FRAMES);
  });
});

describe("timeLabel", () => {
  it("sorts by time", () => {
    expect(timeLabel(12.5)).toBe("0m12.50s");
    expect(timeLabel(75.25)).toBe("1m15.25s");
  });
});
