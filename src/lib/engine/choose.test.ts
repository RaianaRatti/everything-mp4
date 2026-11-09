import { describe, expect, it } from "vitest";
import { chooseEngine, type ChooseInput } from "./choose";

const base: ChooseInput = {
  browserReads: true,
  container: "mp4",
  video: { from: "h264", canDecode: true, to: "h264", changed: false },
  audio: { from: "aac", canDecode: true, to: "aac", changed: false },
  browserEncodes: { video: true, audio: true },
  engine: null,
};

describe("chooseEngine", () => {
  it("copies when nothing changes", () => {
    expect(chooseEngine(base)).toMatchObject({ engine: "browser", copy: true });
  });

  it("re-encodes in the browser when settings change", () => {
    const choice = chooseEngine({ ...base, video: { ...base.video!, changed: true } });
    expect(choice).toMatchObject({ engine: "browser", copy: false, summary: "fast" });
    expect(choice.reason).toContain("sound is copied");
  });

  it("uses the engine for formats the browser can't write", () => {
    const choice = chooseEngine({
      ...base,
      container: "avi",
      video: { ...base.video!, to: "mpeg4" },
    });
    expect(choice.engine).toBe("engine");
    expect(choice.reason).toContain("can't write this format");
  });

  it("uses the engine for files the browser can't read", () => {
    const choice = chooseEngine({ ...base, browserReads: false });
    expect(choice).toMatchObject({ engine: "engine", copy: true });
  });

  it("uses the engine when the browser can't encode the codec", () => {
    const choice = chooseEngine({
      ...base,
      video: { ...base.video!, to: "hevc" },
      browserEncodes: { video: false, audio: true },
    });
    expect(choice.engine).toBe("engine");
    expect(choice.reason).toContain("can't make H.265");
  });

  it("says when nothing can do it", () => {
    const choice = chooseEngine({
      ...base,
      video: { ...base.video!, to: "av1" },
      browserEncodes: { video: false, audio: true },
    });
    expect(choice.engine).toBeNull();
  });

  it("respects what the engine build supports", () => {
    const engine = { muxers: new Set(["mp4"]), encoders: new Set(["aac"]) };
    const choice = chooseEngine({
      ...base,
      container: "avi",
      engine,
      video: { ...base.video!, to: "mpeg4" },
    });
    expect(choice.engine).toBeNull();
    expect(choice.reason).toContain("this format");
  });
});
