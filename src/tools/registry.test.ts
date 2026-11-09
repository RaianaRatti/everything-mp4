import { describe, expect, it } from "vitest";
import { CATEGORIES, searchTools, tools } from "./registry";

describe("registry", () => {
  it("has unique ids in known categories", () => {
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
    for (const tool of tools) expect(CATEGORIES).toContain(tool.category);
  });
});

describe("searchTools", () => {
  it("returns everything for an empty query", () => {
    expect(searchTools("  ")).toHaveLength(tools.length);
  });

  it("finds tools by keyword and ranks label matches first", () => {
    expect(searchTools("mp3")[0]?.id).toBe("extract-audio");
    expect(searchTools("mov to mp4")[0]?.id).toBe("convert");
    expect(searchTools("compress")[0]?.id).toBe("compress");
    expect(searchTools("GIF")[0]?.id).toBe("video-to-gif");
  });

  it("needs every word to match", () => {
    expect(searchTools("gif nonsenseword")).toEqual([]);
  });
});
