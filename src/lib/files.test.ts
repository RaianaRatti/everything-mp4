import { describe, expect, it } from "vitest";
import {
  acceptFor,
  baseName,
  describeKinds,
  extension,
  fileKind,
  formatBytes,
  outputName,
  uniqueNames,
} from "./files";

describe("names", () => {
  it("splits off the extension", () => {
    expect(extension("holiday.MOV")).toBe("mov");
    expect(extension("no-extension")).toBe("");
    expect(baseName("holiday.final.mov")).toBe("holiday.final");
    expect(baseName(".mp4")).toBe("file");
  });

  it("builds output names", () => {
    expect(outputName("holiday.mov", "trimmed", "mp4")).toBe("holiday-trimmed.mp4");
    expect(outputName("holiday.mov", "", ".webm")).toBe("holiday.webm");
  });

  it("makes names unique", () => {
    expect(uniqueNames(["a.mp4", "b.mp4", "A.mp4", "a.mp4"])).toEqual([
      "a.mp4",
      "b.mp4",
      "A (2).mp4",
      "a (3).mp4",
    ]);
  });
});

describe("fileKind", () => {
  it.each([
    [{ name: "clip.mkv", type: "" }, "video"],
    [{ name: "clip.bin", type: "video/mp4" }, "video"],
    [{ name: "song.mp3", type: "audio/mpeg" }, "audio"],
    [{ name: "song.m4a", type: "video/mp4" }, "video"],
    [{ name: "voice.ogg", type: "audio/ogg" }, "audio"],
    [{ name: "photo.JPG", type: "" }, "image"],
    [{ name: "subs.srt", type: "" }, "subtitle"],
    [{ name: "subs.vtt", type: "text/vtt" }, "subtitle"],
    [{ name: "notes.txt", type: "text/plain" }, null],
  ])("%o → %s", (file, kind) => {
    expect(fileKind(file)).toBe(kind);
  });
});

describe("helpers", () => {
  it("builds accept strings", () => {
    const accept = acceptFor(["video", "subtitle"]);
    expect(accept).toContain("video/*");
    expect(accept).toContain(".mkv");
    expect(accept).toContain(".srt");
    expect(accept).not.toContain("subtitle/*");
  });

  it("describes kinds", () => {
    expect(describeKinds(["video"])).toBe("video");
    expect(describeKinds(["video", "audio"])).toBe("video or audio file");
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 ** 2)).toBe("5.5 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.00 GB");
  });
});
