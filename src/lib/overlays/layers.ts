import { canvasToBlob } from "../gfx/canvas";
import { between } from "../ffmpeg/edit";

/**
 * The shared layer system. Every layer is drawn by `drawLayer` onto a frame-sized canvas: the live
 * preview draws it on screen, and the export draws the same thing into a PNG that ffmpeg lays over
 * the video, so the two match.
 */

export type Anim = "none" | "fade" | "slide";

interface Base {
  id: number;
  /** Center, as a percent of the frame. */
  x: number;
  y: number;
  rotation: number;
  /** 0–1. */
  opacity: number;
  start: number;
  end: number;
  anim: Anim;
}

export interface TextLayer extends Base {
  kind: "text";
  text: string;
  font: string;
  /** Text height as a percent of the frame's height. */
  size: number;
  color: string;
  /** Outline width as a percent of the text size; 0 for none. */
  outline: number;
  outlineColor: string;
  shadow: boolean;
  box: boolean;
  boxColor: string;
  align: "left" | "center" | "right";
  /** Wrap width as a percent of the frame's width. */
  wrap: number;
}

export interface ImageLayer extends Base {
  kind: "image";
  image: ImageBitmap;
  /** Width as a percent of the frame's width. */
  width: number;
  /** Repeat across the whole frame. */
  tiled: boolean;
}

export type Layer = TextLayer | ImageLayer;

/** Fonts that need no download: the app's own, plus the browser's standard families. */
export const FONTS = [
  { value: "Pixelify Sans", label: "pixel" },
  { value: "Arial, Helvetica, sans-serif", label: "clean" },
  { value: "Georgia, 'Times New Roman', serif", label: "classic" },
  { value: "Impact, 'Arial Black', sans-serif", label: "bold" },
  { value: "'Courier New', monospace", label: "typewriter" },
  { value: "'Comic Sans MS', 'Comic Neue', cursive", label: "playful" },
  { value: "'Brush Script MT', cursive", label: "handwritten" },
  { value: "Verdana, sans-serif", label: "wide" },
  { value: "'Trebuchet MS', sans-serif", label: "friendly" },
  { value: "'Palatino Linotype', Palatino, serif", label: "elegant" },
];

/** Adds an uploaded font file, returning the family name to use. */
export async function addFont(file: File): Promise<string> {
  const family = `custom-${file.name.replace(/\.\w+$/, "").replace(/[^\w-]/g, "")}`;
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  return family;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  if (layer.kind === "image") {
    const iw = (layer.width / 100) * w;
    const ih = iw * (layer.image.height / layer.image.width);
    if (layer.tiled) {
      for (let ty = -ih; ty < h + ih; ty += ih * 2) {
        for (let tx = -iw; tx < w + iw; tx += iw * 2) {
          ctx.save();
          ctx.translate(tx + iw / 2, ty + ih / 2);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.drawImage(layer.image, -iw / 2, -ih / 2, iw, ih);
          ctx.restore();
        }
      }
    } else {
      ctx.translate((layer.x / 100) * w, (layer.y / 100) * h);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(layer.image, -iw / 2, -ih / 2, iw, ih);
    }
    ctx.restore();
    return;
  }
  const px = (layer.size / 100) * h;
  ctx.font = `600 ${px}px ${layer.font}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align;
  const lines = wrapLines(ctx, layer.text, (layer.wrap / 100) * w);
  const lineH = px * 1.2;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const total = lineH * lines.length;
  ctx.translate((layer.x / 100) * w, (layer.y / 100) * h);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  const left = layer.align === "left" ? 0 : layer.align === "right" ? -widest : -widest / 2;
  if (layer.box) {
    const pad = px * 0.3;
    ctx.fillStyle = layer.boxColor;
    ctx.fillRect(left - pad, -total / 2 - pad, widest + pad * 2, total + pad * 2);
  }
  const anchor = layer.align === "left" ? left : layer.align === "right" ? left + widest : 0;
  lines.forEach((line, i) => {
    const y = -total / 2 + lineH * (i + 0.5);
    if (layer.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = px * 0.15;
      ctx.shadowOffsetY = px * 0.06;
    }
    if (layer.outline > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = (layer.outline / 100) * px;
      ctx.strokeStyle = layer.outlineColor;
      ctx.strokeText(line, anchor, y);
      ctx.shadowColor = "transparent";
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, anchor, y);
  });
  ctx.restore();
}

/** Draws one layer into a transparent PNG the size of the frame. */
export async function layerPng(layer: Layer, w: number, h: number): Promise<File> {
  if (layer.kind === "text") await document.fonts.load(`600 20px ${layer.font}`).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  drawLayer(canvas.getContext("2d")!, layer, w, h);
  const blob = await canvasToBlob(canvas);
  return new File([blob], `layer${layer.id}.png`, { type: "image/png" });
}

const ANIM_SECONDS = 0.5;

/**
 * ffmpeg arguments that lay PNG layers (inputs 1…n, made by `layerPng`) over the video (input 0),
 * each shown between its start and end with its animation. Writes `[v]`.
 */
export function overlayGraph(layers: Layer[]): string {
  const parts: string[] = [];
  let base = "0:v";
  layers.forEach((l, i) => {
    const d = Math.min(ANIM_SECONDS, (l.end - l.start) / 2);
    const fade =
      l.anim === "fade"
        ? `,fade=t=in:st=${l.start}:d=${d}:alpha=1,fade=t=out:st=${(l.end - d).toFixed(3)}:d=${d}:alpha=1`
        : "";
    parts.push(`[${i + 1}:v]format=rgba${fade}[l${i}]`);
    const x =
      l.anim === "slide"
        ? `'if(lt(t,${l.start + d}),-W*(1-(t-${l.start})/${d}),0)'`
        : "0";
    const out = i === layers.length - 1 ? "v" : `b${i}`;
    parts.push(`[${base}][l${i}]overlay=x=${x}:y=0:enable=${between(l.start, l.end)}[${out}]`);
    base = out;
  });
  return parts.join(";");
}

/** Input arguments for the layer PNGs: each one held for the whole video. */
export function layerInputs(paths: string[], duration: number): string[] {
  return paths.flatMap((p) => ["-loop", "1", "-t", String(duration), "-i", p]);
}
