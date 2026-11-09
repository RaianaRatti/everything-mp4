import { describe, expect, it } from "vitest";
import {
  explainFailure,
  parseClock,
  parseDurationLine,
  parseListing,
  parseProgressTime,
} from "./logs";
import { limitThreads } from "./args";
import { parseFfmpegInfo } from "./probe";

describe("time parsing", () => {
  it("reads clock times", () => {
    expect(parseClock("01:02:03.45")).toBeCloseTo(3723.45);
    expect(parseClock("-00:00:01.50")).toBe(-1.5);
    expect(parseClock("N/A")).toBeNull();
  });

  it("reads progress and duration lines", () => {
    expect(
      parseProgressTime(
        "frame=   50 fps=0.0 q=28.0 size=     256kB time=00:00:02.00 bitrate=1048.6kbits/s speed=4.1x",
      ),
    ).toBe(2);
    expect(parseProgressTime("size=N/A time=N/A bitrate=N/A")).toBeNull();
    expect(
      parseDurationLine("  Duration: 00:01:23.45, start: 0.000000, bitrate: 1305 kb/s"),
    ).toBeCloseTo(83.45);
  });
});

describe("parseListing", () => {
  it("reads muxers", () => {
    const lines = [
      "File formats:",
      " D. = Demuxing supported",
      " .E = Muxing supported",
      " --",
      "  E 3gp             3GP (3GPP file format)",
      " DE avi             AVI (Audio Video Interleaved)",
      " D  aac             raw ADTS AAC (Advanced Audio Coding)",
      "  E mp4             MP4 (MPEG-4 Part 14)",
    ];
    expect([...parseListing(lines, "muxers")]).toEqual(["3gp", "avi", "mp4"]);
  });

  it("reads encoders", () => {
    const lines = [
      "Encoders:",
      " V..... = Video",
      " A..... = Audio",
      " ------",
      " V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)",
      " VF...D prores_ks            Apple ProRes (iCodec Pro) (codec prores)",
      " A....D aac                  AAC (Advanced Audio Coding)",
    ];
    expect([...parseListing(lines, "encoders")]).toEqual(["libx264", "prores_ks", "aac"]);
  });
});

describe("explainFailure", () => {
  it("turns ffmpeg errors into plain language", () => {
    expect(explainFailure(["/in/0.avi: Invalid data found when processing input"])).toContain(
      "damaged",
    );
    expect(explainFailure(["[libx264 @ 0x1] height not divisible by 2 (640x361)"])).toContain(
      "even",
    );
    expect(explainFailure(["Cannot allocate memory", "Aborted()"])).toContain("memory");
    expect(explainFailure(["Unknown encoder 'libfoo'", "Aborted()"])).toContain("can't make");
    expect(explainFailure(["something odd"])).toBe("The video engine couldn't process this file.");
  });
});

describe("parseFfmpegInfo", () => {
  it("reads an AVI", () => {
    const info = parseFfmpegInfo(
      [
        "Input #0, avi, from '/in/0.avi':",
        "  Metadata:",
        "    title           : Test clip",
        "    software        : Lavf59.27.100",
        "  Duration: 00:00:04.00, start: 0.000000, bitrate: 1305 kb/s",
        "  Stream #0:0: Video: mpeg4 (Simple Profile) (FMP4 / 0x34504D46), yuv420p, 640x480 [SAR 1:1 DAR 4:3], 1166 kb/s, 25 fps, 25 tbr, 25 tbn",
        "  Stream #0:1: Audio: mp3 (U[0][0][0] / 0x0055), 44100 Hz, mono, fltp, 64 kb/s",
        "At least one output file must be specified",
      ],
      { name: "clip.mp4", size: 650_000 },
    )!;
    expect(info.format.name).toBe("AVI");
    expect(info.realExtension).toBe("avi");
    expect(info.duration).toBe(4);
    expect(info.bitrate).toBe(1_305_000);
    expect(info.tags.title).toBe("Test clip");
    expect(info.video[0]).toMatchObject({
      codec: "MPEG-4 Part 2",
      width: 640,
      height: 480,
      fps: 25,
    });
    expect(info.audio[0]).toMatchObject({
      codec: "MP3",
      sampleRate: 44100,
      channels: 1,
      bitrate: 64_000,
    });
    expect(info.readBy).toBe("engine");
  });

  it("reads a WMV and an MP4 with rotation", () => {
    const wmv = parseFfmpegInfo(
      [
        "Input #0, asf, from '/in/0.wmv':",
        "  Duration: 00:00:04.06, start: 0.000000, bitrate: 1173 kb/s",
        "  Stream #0:0: Audio: wmav2 (a[1][0][0] / 0x0161), 44100 Hz, 1 channels, fltp, 128 kb/s",
        "  Stream #0:1: Video: wmv2 (WMV2 / 0x32564D57), yuv420p, 640x360, 1000 kb/s, SAR 1:1 DAR 16:9, 30 fps, 30 tbr, 1k tbn",
      ],
      { name: "a.wmv", size: 1 },
    )!;
    expect(wmv.realExtension).toBeNull();
    expect(wmv.video[0]).toMatchObject({ codec: "Windows Media Video 8", width: 640, height: 360 });
    expect(wmv.audio[0]).toMatchObject({ channels: 1 });

    const mp4 = parseFfmpegInfo(
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/in/0.mp4':",
        "  Duration: 00:00:06.00, start: 0.000000, bitrate: 900 kb/s",
        "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 800 kb/s, 30 fps, 30 tbr, 15360 tbn (default)",
        "    Metadata:",
        "      handler_name    : VideoHandler",
        "    Side data:",
        "      displaymatrix: rotation of -90.00 degrees",
        "  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 69 kb/s (default)",
      ],
      { name: "a.mp4", size: 1 },
    )!;
    expect(mp4.video[0]).toMatchObject({ codec: "H.264", rotation: 90, width: 1280 });
    expect(mp4.audio[0]).toMatchObject({ channels: 2, language: "eng" });
    expect(mp4.tags).toEqual({});
  });

  it("returns null without an input line", () => {
    expect(parseFfmpegInfo(["/in/0.bin: Invalid data found"], { name: "a", size: 1 })).toBeNull();
  });
});

describe("limitThreads", () => {
  it("caps decoder and encoder threads", () => {
    expect(limitThreads(["-i", "a.mp4", "-c:v", "libx264", "/out/b.mp4"])).toEqual([
      "-threads",
      "2",
      "-i",
      "a.mp4",
      "-c:v",
      "libx264",
      "-threads",
      "4",
      "-filter_threads",
      "2",
      "/out/b.mp4",
    ]);
  });
});
