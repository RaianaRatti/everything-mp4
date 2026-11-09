import { describe, expect, it } from "vitest";
import { audioBitrate, scaleToShortSide, videoBitrate } from "../engine/estimate";
import { convertArgs } from "./convertArgs";

describe("convertArgs", () => {
  it("copies streams into a new container", () => {
    const args = convertArgs({
      input: "/in/0.mov",
      output: "/out/a.mkv",
      container: "mkv",
      video: { codec: "h264", copy: true },
      audio: { codec: "aac", copy: true },
    });
    expect(args.join(" ")).toBe(
      "-i /in/0.mov -map 0:v:0? -map 0:a:0? -map_metadata 0 -c:v copy -c:a copy -f matroska -y /out/a.mkv",
    );
  });

  it("re-encodes with size, frame rate and bitrate", () => {
    const args = convertArgs({
      input: "in.avi",
      output: "out.mp4",
      container: "mp4",
      video: {
        codec: "h264",
        copy: false,
        bitrate: 2_000_000,
        size: { width: 1280, height: 720 },
        fps: 30,
      },
      audio: { codec: "aac", copy: false, bitrate: 128_000 },
    }).join(" ");
    expect(args).toContain("-vf scale=1280:720 -r 30 -c:v libx264");
    expect(args).toContain("-b:v 2000k");
    expect(args).toContain("-c:a aac -b:a 128k");
    expect(args).toContain("-movflags +faststart -f mp4 -y out.mp4");
  });

  it("drops sound, trims, and makes DVD-ready MPEG-2", () => {
    const args = convertArgs({
      input: "in.mp4",
      output: "out.mpg",
      container: "mpeg",
      video: { codec: "mpeg2", copy: false, dvd: "pal" },
      audio: null,
      trim: { start: 5, end: 15 },
    }).join(" ");
    expect(args.startsWith("-ss 5.000 -i in.mp4 -t 10.000")).toBe(true);
    expect(args).toContain("pad=720:576");
    expect(args).toContain("-r 25");
    expect(args).toContain("-an");
  });

  it("snaps MPEG-2 frame rates and forces 48 kHz for Opus", () => {
    const args = convertArgs({
      input: "a",
      output: "b",
      container: "ogg",
      video: { codec: "mpeg2", copy: false, fps: 31 },
      audio: { codec: "opus", copy: false, sampleRate: 44_100 },
    }).join(" ");
    expect(args).toContain("-r 30 ");
    expect(args).toContain("-ar 48000");
  });
});

describe("estimates", () => {
  it("scales bitrate with pixels and codec", () => {
    const hd = videoBitrate("h264", { width: 1920, height: 1080 }, 30, "balanced");
    expect(hd).toBeGreaterThan(4_000_000);
    expect(hd).toBeLessThan(6_000_000);
    expect(videoBitrate("hevc", { width: 1920, height: 1080 }, 30, "balanced")).toBeLessThan(hd);
    expect(videoBitrate("h264", { width: 1920, height: 1080 }, 30, "smaller")).toBeLessThan(hd);
    expect(audioBitrate("pcm", "smaller", 48_000, 2)).toBe(1_536_000);
  });

  it("scales to a short side without enlarging", () => {
    expect(scaleToShortSide({ width: 1920, height: 1080 }, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(scaleToShortSide({ width: 1080, height: 1920 }, 720)).toEqual({
      width: 720,
      height: 1280,
    });
    expect(scaleToShortSide({ width: 640, height: 360 }, 720)).toEqual({ width: 640, height: 360 });
    expect(scaleToShortSide({ width: 1919, height: 1081 }, null)).toEqual({
      width: 1918,
      height: 1080,
    });
  });
});
