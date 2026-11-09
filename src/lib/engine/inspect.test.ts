import { describe, expect, it } from "vitest";
import { mediaWarnings, realExtension, roundFps, type MediaInfo } from "./inspect";

const base: MediaInfo = {
  name: "clip.mp4",
  size: 1000,
  format: { name: "MP4", id: "mp4", mime: "video/mp4" },
  realExtension: null,
  duration: 10,
  bitrate: 800,
  video: [
    {
      codec: "H.264",
      codecId: "h264",
      codecString: "avc1.64001f",
      width: 1920,
      height: 1080,
      rotation: 0,
      fps: 30,
      variableFrameRate: false,
      bitrate: 5e6,
      hdr: false,
      canDecode: true,
      language: null,
    },
  ],
  audio: [],
  subtitles: [],
  tags: {},
  hasCoverArt: false,
  canPlay: true,
  fastStart: true,
  readBy: "browser",
};

describe("realExtension", () => {
  it("is null when the name fits the format", () => {
    expect(realExtension("a.MP4", "mp4", ["mp4", "m4v"])).toBeNull();
  });
  it("gives the right extension when it doesn't", () => {
    expect(realExtension("a.mp4", "mkv", ["mkv", "mka"])).toBe("mkv");
  });
});

describe("roundFps", () => {
  it("rounds to two decimals", () => {
    expect(roundFps(30000 / 1001)).toBe(29.97);
    expect(roundFps(0)).toBeNull();
  });
});

describe("mediaWarnings", () => {
  it("has nothing to say about an ordinary file", () => {
    expect(mediaWarnings(base)).toEqual([]);
  });

  it("doesn't nag about files only the engine reads", () => {
    const v = base.video[0]!;
    const info: MediaInfo = {
      ...base,
      readBy: "engine",
      format: { name: "AVI", id: "avi", mime: "" },
      video: [{ ...v, canDecode: false }],
    };
    expect(mediaWarnings(info)).toEqual([]);
  });

  it("explains common problems", () => {
    const v = base.video[0]!;
    const info: MediaInfo = {
      ...base,
      realExtension: "mov",
      format: { name: "QuickTime (MOV)", id: "mov", mime: "video/quicktime" },
      fastStart: false,
      video: [{ ...v, variableFrameRate: true, hdr: true, rotation: 90, canDecode: false }],
    };
    const text = mediaWarnings(info).join(" ");
    expect(text).toContain("really a QuickTime (MOV) file");
    expect(text).toContain("Variable frame rate");
    expect(text).toContain("HDR");
    expect(text).toContain("90°");
    expect(text).toContain("Not optimized for streaming");
  });
});
