import { useEffect, useRef } from "react";
import { drawLayer, type Layer } from "../lib/overlays/layers";

/** Draws the layers visible at `time` over a preview, with the same code the export uses. */
export function LayerCanvas({
  layers,
  width,
  height,
  time,
}: {
  layers: Layer[];
  width: number;
  height: number;
  time: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      ctx.clearRect(0, 0, width, height);
      for (const l of layers) if (time >= l.start && time <= l.end) drawLayer(ctx, l, width, height);
    });
    return () => {
      live = false;
    };
  }, [layers, width, height, time]);
  return <canvas ref={ref} width={width} height={height} className="absolute inset-0 size-full" />;
}
