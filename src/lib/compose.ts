import { fitInto, type Fit, type Rect, type Size } from "./layout";

export interface Layer {
  /** The current frame, or null when this video has ended (its box is then drawn black). */
  frame: CanvasImageSource | null;
  size: Size;
  rect: Rect;
  fit: Fit;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws one output frame: a black background, then each layer in order (the last one on top).
 * Shared by the live preview and the export so the two always match.
 */
export function drawComposite(ctx: Context2D, frame: Size, layers: Layer[]): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.imageSmoothingQuality = "high";

  for (const layer of layers) {
    const box = {
      x: layer.rect.x * frame.width,
      y: layer.rect.y * frame.height,
      w: layer.rect.w * frame.width,
      h: layer.rect.h * frame.height,
    };
    ctx.fillStyle = "#000";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    if (!layer.frame || !layer.size.width || !layer.size.height) continue;
    const p = fitInto(layer.size, box, layer.fit);
    ctx.drawImage(layer.frame, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  }
}
