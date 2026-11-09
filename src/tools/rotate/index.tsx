import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Checkbox, Field, PanelSection, Segmented, inputClass } from "../../components/ui";
import { ENCODE_MP4, even, sameExtension, mimeFor } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

type Corners = "fit" | "fill";

/**
 * Where a turn of `angle` degrees clockwise lands: the nearest quarter turn, the small tilt left
 * over, and the size of the finished frame. "fit" grows the frame so the whole picture shows with
 * black corners; "fill" keeps the frame and zooms in until the corners are covered.
 */
function rotationLayout(width: number, height: number, angle: number, corners: Corners) {
  const a = ((angle % 360) + 360) % 360;
  const quarters = Math.round(a / 90);
  const tilt = a - quarters * 90;
  const q = quarters % 4;
  const sideways = q % 2 === 1;
  const tw = even(sideways ? height : width);
  const th = even(sideways ? width : height);
  if (!tilt) return { angle: a, quarters: q, tilt, width: tw, height: th, zoom: 1 };
  const rad = (a * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  if (corners === "fit") {
    return {
      angle: a,
      quarters: q,
      tilt,
      width: even(width * cos + height * sin),
      height: even(width * sin + height * cos),
      zoom: 1,
    };
  }
  const t = (Math.abs(tilt) * Math.PI) / 180;
  // Zoom in just enough that the tilted picture still covers the whole frame.
  const zoom = Math.max(
    Math.cos(t) + (th / tw) * Math.sin(t),
    Math.cos(t) + (tw / th) * Math.sin(t),
  );
  return { angle: a, quarters: q, tilt, width: tw, height: th, zoom };
}

export default function Rotate() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [angle, setAngle] = useState(0);
  const [corners, setCorners] = useState<Corners>("fit");
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [bake, setBake] = useState(false);
  const player = usePlayer();

  const video = media?.info.video[0];
  const ext = media ? sameExtension(media) : "mp4";
  // Players already show the file turned by its rotation flag, and ffmpeg reads it the same way.
  const sideways = video ? video.rotation % 180 !== 0 : false;
  const width = video ? (sideways ? video.height : video.width) : 0;
  const height = video ? (sideways ? video.width : video.height) : 0;
  const layout = rotationLayout(width, height, angle, corners);
  // The rotation flag only exists in MP4/MOV, and only does quarter turns without flips.
  const canFlag = ["mp4", "mov", "m4v"].includes(ext) && !flipH && !flipV && !layout.tilt;
  const lossless = canFlag && !bake;
  const unchanged = !layout.angle && !flipH && !flipV;

  const filters = (): string => {
    const f: string[] = [];
    if (flipH) f.push("hflip");
    if (flipV) f.push("vflip");
    if (layout.quarters === 1) f.push("transpose=1");
    if (layout.quarters === 2) f.push("hflip,vflip");
    if (layout.quarters === 3) f.push("transpose=2");
    if (layout.tilt) {
      const rad = ((layout.tilt * Math.PI) / 180).toFixed(6);
      if (corners === "fill") {
        f.push(
          `scale=${even(layout.width * layout.zoom)}:${even(layout.height * layout.zoom)}`,
          `rotate=${rad}:ow=${layout.width}:oh=${layout.height}`,
        );
      } else {
        f.push(`rotate=${rad}:ow=${layout.width}:oh=${layout.height}:c=black`);
      }
    }
    f.push("setsar=1");
    return f.join(",");
  };

  const preset = ["0", "90", "180", "270"].find((p) => Number(p) === layout.angle) ?? null;

  const settings = media && video && (
    <PanelSection title="rotate">
      <Segmented
        label="Turn"
        value={preset}
        onChange={(v) => setAngle(Number(v))}
        options={[
          { value: "0", label: "0°" },
          { value: "90", label: "90°" },
          { value: "180", label: "180°" },
          { value: "270", label: "270°" },
        ]}
      />
      <Field label="angle (clockwise)">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={360}
            step={0.5}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Rotation angle in degrees"
          />
          <input
            type="number"
            min={0}
            max={360}
            step={0.5}
            value={angle}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setAngle(Math.min(360, Math.max(0, n)));
            }}
            className={`${inputClass} w-24 shrink-0 tabular-nums`}
            aria-label="Rotation angle in degrees"
          />
        </div>
      </Field>
      {layout.tilt !== 0 && (
        <Segmented
          label="Corners"
          value={corners}
          onChange={setCorners}
          options={[
            { value: "fit", label: "black corners" },
            { value: "fill", label: "zoom to fill" },
          ]}
        />
      )}
      <Checkbox checked={flipH} onChange={setFlipH} label="flip left to right (mirror)" />
      <Checkbox checked={flipV} onChange={setFlipV} label="flip upside down" />
      {canFlag && !unchanged && (
        <Checkbox
          checked={bake}
          onChange={setBake}
          label="bake it in (for players that ignore rotation)"
        />
      )}
      {!unchanged && (
        <p className="text-xs text-ink-3">
          {lossless
            ? "Instant, no quality loss: only the rotation flag changes."
            : layout.tilt && corners === "fit"
              ? `Black fills the corners so nothing is cut off. Comes out ${layout.width}×${layout.height}.`
              : layout.tilt
                ? `Zooms in so there are no black corners; the edges get cut off. Comes out ${layout.width}×${layout.height}.`
                : "Re-encodes the video so every player shows it turned."}
        </p>
      )}
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="rotate"
      subtitle="Change video angle"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action="rotate"
      running="rotating…"
      disabled={(!video && "This file has no video.") || unchanged}
      jobs={() => {
        const m = media!;
        if (lossless) {
          const total = (video!.rotation + layout.quarters * 90) % 360;
          return [
            {
              duration: m.info.duration,
              mime: mimeFor(ext),
              name: outputName(m.file.name, "rotated", ext),
              args: ([input]) => [
                "-i",
                input!,
                "-map",
                "0",
                "-c",
                "copy",
                "-metadata:s:v:0",
                `rotate=${total}`,
                `/out/rotated.${ext}`,
              ],
            },
          ];
        }
        return [
          {
            duration: m.info.duration,
            mime: "video/mp4",
            name: outputName(m.file.name, "rotated", "mp4"),
            args: ([input]) => [
              "-i",
              input!,
              "-vf",
              filters(),
              "-map",
              "0:v:0",
              "-map",
              "0:a:0?",
              ...ENCODE_MP4,
              "-metadata:s:v:0",
              "rotate=0",
              "/out/rotated.mp4",
            ],
          },
        ];
      }}
    >
      {media && (
        <Player
          media={media}
          player={player}
          onRemove={() => setMedia(null)}
          stage={
            video
              ? (el) => (
                  <Stage
                    source={{ width, height }}
                    frame={layout}
                    transform={`rotate(${layout.angle}deg) scale(${layout.zoom * (flipH ? -1 : 1)}, ${layout.zoom * (flipV ? -1 : 1)})`}
                  >
                    {el}
                  </Stage>
                )
              : undefined
          }
        />
      )}
    </EnginePage>
  );
}

/**
 * The finished frame drawn to scale: a black box the size of the output, with the turned video
 * inside it, so the black corners (or the cut-off edges) show exactly as they'll come out.
 */
function Stage({
  source,
  frame,
  transform,
  children,
}: {
  source: { width: number; height: number };
  frame: { width: number; height: number };
  transform: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pad = 32;
  const s = Math.max(
    0,
    Math.min((box.width - pad) / frame.width, (box.height - pad) / frame.height),
  );
  return (
    <div ref={ref} className="absolute inset-0 flex items-center justify-center bg-paper-3">
      <div
        className="relative overflow-hidden bg-black"
        style={{ width: frame.width * s, height: frame.height * s }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: source.width * s,
            height: source.height * s,
            transform: `translate(-50%, -50%) ${transform}`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
