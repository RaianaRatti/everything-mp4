import { describe, expect, it } from "vitest";
import { formatTime, parseTime } from "./time";

describe("parseTime", () => {
  it.each([
    ["200", 200],
    ["12.5", 12.5],
    ["3:20", 200],
    ["1:00", 60],
    ["0:07.25", 7.25],
    ["1:02:03.5", 3723.5],
    ["3m20s", 200],
    ["3m 20s", 200],
    ["1h 2m", 3720],
    ["90s", 90],
    ["2 min", 120],
    [" 1:00 ", 60],
  ])("%s → %d", (text, seconds) => {
    expect(parseTime(text)).toBe(seconds);
  });

  it.each(["", "abc", "1:2:3:4", "1:75", "1:60:00", "-5", "3m20x"])("rejects %j", (text) => {
    expect(parseTime(text)).toBeNull();
  });
});

describe("formatTime", () => {
  it.each([
    [0, "0:00.0"],
    [7.25, "0:07.2"],
    [200, "3:20.0"],
    [59.99, "0:59.9"],
    [3723.5, "1:02:03.5"],
  ])("%d → %s", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });

  it("can drop decimals", () => {
    expect(formatTime(200.9, 0)).toBe("3:20");
  });

  it("round-trips through parseTime", () => {
    for (const s of [0, 1.5, 61.2, 200, 3599.9, 3723.5]) {
      expect(parseTime(formatTime(s))).toBeCloseTo(s, 5);
    }
  });
});
