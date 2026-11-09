import { describe, expect, it } from "vitest";
import { GIF_DEFAULTS, estimateBytes, frameCount, gifArgs, type GifSettings } from "./gif";

const s: GifSettings = { ...GIF_DEFAULTS, start: 2, end: 5 };
const source = { width: 1920, height: 1080 };

describe("gif", () => {
  it("counts frames with speed and boomerang", () => {
    expect(frameCount(s)).toBe(36);
    expect(frameCount({ ...s, speed: 2 })).toBe(18);
    expect(frameCount({ ...s, boomerang: true })).toBe(72);
  });

  it("estimates smaller files for fewer colors, no dithering, and WebP", () => {
    const base = estimateBytes(s, source);
    expect(base).toBeGreaterThan(500_000);
    expect(estimateBytes({ ...s, colors: 32, dither: "none" }, source)).toBeLessThan(base);
    expect(estimateBytes({ ...s, format: "webp" }, source)).toBeLessThan(base);
  });

  it("builds a palette filter graph", () => {
    const args = gifArgs("in.mp4", "/out/a.gif", {
      ...s,
      speed: 2,
      boomerang: true,
      plays: 3,
    }).join(" ");
    expect(args).toContain("-ss 2.000 -t 3.000 -i in.mp4");
    expect(args).toContain("[0:v]setpts=PTS/2,fps=12,scale=480:-2:flags=lanczos,split[fw][bw]");
    expect(args).toContain("palettegen=max_colors=256");
    expect(args).toContain("-loop 2 ");
  });

  it("plays once and makes WebP", () => {
    expect(gifArgs("i", "o", { ...s, plays: 1 }).join(" ")).toContain("-loop -1 ");
    const webp = gifArgs("i", "o", { ...s, format: "webp", plays: 1 }).join(" ");
    expect(webp).toContain("libwebp_anim");
    expect(webp).toContain("-loop 1 ");
    expect(webp).not.toContain("palettegen");
  });
});
