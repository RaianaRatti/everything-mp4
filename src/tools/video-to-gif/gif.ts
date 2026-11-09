export type Dither = "none" | "bayer" | "floyd_steinberg" | "sierra2_4a";

export interface GifSettings {
  start: number;
  end: number;
  fps: number;
  /** Output width in pixels; null keeps the original. */
  width: number | null;
  /** 2 plays twice as fast. */
  speed: number;
  /** 0 loops forever, 1 plays once, n plays n times. */
  plays: number;
  boomerang: boolean;
  colors: number;
  dither: Dither;
  format: "gif" | "webp";
}

export const GIF_DEFAULTS: Omit<GifSettings, "start" | "end"> = {
  fps: 12,
  width: 480,
  speed: 1,
  plays: 0,
  boomerang: false,
  colors: 256,
  dither: "sierra2_4a",
  format: "gif",
};

/** How many frames the result has. */
export function frameCount(s: GifSettings): number {
  const seconds = Math.max(0, s.end - s.start) / s.speed;
  return Math.max(1, Math.round(seconds * s.fps)) * (s.boomerang ? 2 : 1);
}

/** The result's height for a width, keeping the aspect ratio. */
export function outputHeight(
  source: { width: number; height: number },
  width: number | null,
): number {
  if (!width) return source.height;
  return Math.max(2, Math.round((source.height * width) / source.width));
}

/**
 * A rough size estimate. GIF compresses video poorly: about half a byte per pixel per frame at
 * 256 colors with dithering, less with fewer colors and without dithering. WebP is much smaller.
 */
export function estimateBytes(s: GifSettings, source: { width: number; height: number }): number {
  const width = s.width ?? source.width;
  const pixels = width * outputHeight(source, s.width) * frameCount(s);
  if (s.format === "webp") return pixels * 0.07;
  const perPixel = 0.1 + 0.3 * (Math.log2(s.colors) / 8) + (s.dither === "none" ? 0 : 0.12);
  return pixels * perPixel;
}

/** ffmpeg arguments: one pass that builds the best palette for the clip, then uses it. */
export function gifArgs(input: string, output: string, s: GifSettings): string[] {
  const filters = [
    s.speed !== 1 ? `setpts=PTS/${s.speed}` : null,
    `fps=${s.fps}`,
    s.width ? `scale=${s.width}:-2:flags=lanczos` : null,
  ].filter(Boolean);
  let graph = `[0:v]${filters.join(",")}`;
  if (s.boomerang) graph += ",split[fw][bw];[bw]reverse[rv];[fw][rv]concat=n=2:v=1:a=0";

  const args = [
    "-ss",
    s.start.toFixed(3),
    "-t",
    Math.max(0.05, s.end - s.start).toFixed(3),
    "-i",
    input,
  ];
  // GIF and WebP count repeats differently: GIF's -loop is extra plays (-1 = once), WebP's is total.
  if (s.format === "webp") {
    args.push(
      "-filter_complex",
      `${graph}[out]`,
      "-map",
      "[out]",
      "-c:v",
      "libwebp_anim",
      "-lossless",
      "0",
      "-quality",
      "75",
      "-compression_level",
      "4",
      "-loop",
      String(s.plays),
      "-an",
      "-f",
      "webp",
      "-y",
      output,
    );
    return args;
  }
  const dither = s.dither === "bayer" ? "bayer:bayer_scale=3" : s.dither;
  graph += `,split[a][b];[a]palettegen=max_colors=${s.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=${dither}:diff_mode=rectangle[out]`;
  args.push(
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-loop",
    s.plays === 0 ? "0" : s.plays === 1 ? "-1" : String(s.plays - 1),
    "-an",
    "-f",
    "gif",
    "-y",
    output,
  );
  return args;
}
