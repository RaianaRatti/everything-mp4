import { describe, expect, it } from "vitest";
import { planCompression, retryBitrate, targetBytes, type CompressSource } from "./math";

const MB = 1024 ** 2;
const hd: CompressSource = {
  duration: 60,
  size: { width: 1920, height: 1080 },
  fps: 30,
  bytes: 200 * MB,
  hasAudio: true,
  videoBitrate: 25_000_000,
};

describe("planCompression", () => {
  it("fits the target size", () => {
    const plan = planCompression(hd, { kind: "size", bytes: 50 * MB });
    const bytes = ((plan.videoBitrate + plan.audioBitrate) * hd.duration) / 8;
    expect(bytes).toBeLessThanOrEqual(50 * MB);
    expect(bytes).toBeGreaterThan(45 * MB);
    expect(plan.size).toEqual({ width: 1920, height: 1080 });
    expect(plan.notes).toEqual([]);
  });

  it("lowers the resolution, then the frame rate, for tiny targets", () => {
    const plan = planCompression(hd, { kind: "size", bytes: 10 * MB });
    expect(plan.size.height).toBeLessThan(1080);
    expect(plan.notes.join(" ")).toContain("picture is made smaller");

    const tiny = planCompression({ ...hd, duration: 600 }, { kind: "size", bytes: 10 * MB });
    expect(tiny.fps).toBeLessThan(30);
    expect(tiny.audioBitrate).toBeLessThan(128_000);
  });

  it("says when a target is impossible", () => {
    const plan = planCompression({ ...hd, duration: 3 * 3600 }, { kind: "size", bytes: 10 * MB });
    expect(plan.impossible).toContain("too small");
  });

  it("works out percent smaller", () => {
    expect(targetBytes(hd, { kind: "percent", percent: 75 })).toBe(50 * MB);
  });

  it("scales bitrate with the quality slider", () => {
    const low = planCompression(hd, { kind: "quality", level: 10 });
    const high = planCompression(hd, { kind: "quality", level: 90 });
    expect(low.videoBitrate).toBeLessThan(high.videoBitrate);
    expect(high.videoBitrate).toBeLessThanOrEqual(hd.videoBitrate! * 0.9);
    expect(high.targetBytes).toBeNull();
  });

  it("can cap the resolution", () => {
    expect(planCompression(hd, { kind: "quality", level: 50 }, 720).size).toEqual({
      width: 1280,
      height: 720,
    });
  });
});

describe("retryBitrate", () => {
  it("only retries when clearly too big", () => {
    expect(retryBitrate(1_000_000, 100, 102)).toBeNull();
    expect(retryBitrate(1_000_000, 100, 125)).toBe(744_000);
  });
});
