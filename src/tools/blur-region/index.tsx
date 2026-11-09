import { Plus, X } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EnginePage } from "../../components/EnginePage";
import { OverlayPreview } from "../../components/OverlayPreview";
import { RangeFields } from "../../components/RangeFields";
import { Button, Checkbox, Field, PanelSection, Segmented, Select } from "../../components/ui";
import { canvasToBlob } from "../../lib/gfx/canvas";
import { ENCODE_MP4, even, lerpExpr } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import { moveRect, resizeRect, type Corner, type Rect } from "../../lib/layout";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

type Effect = "blur" | "pixelate" | "solid";

interface Region {
  id: number;
  shape: "rect" | "ellipse" | "free";
  /** The hand-drawn outline, as fractions (0–1) of the region's box. */
  points: { x: number; y: number }[];
  effect: Effect;
  soft: boolean;
  /** Top-left corner and size, as percents of the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Positions at chosen times; the region slides between them. Empty: it stays put. */
  keys: { t: number; x: number; y: number }[];
  start: number;
  end: number;
}

let nextId = 1;

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

const cornerClass: Record<Corner, string> = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
};

const isDrawn = (r: Region) => r.shape === "free" && r.points.length > 2;

/** Trims a box (fractions of the frame) to the part inside the frame. */
function inFrame(rect: Rect): Rect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return {
    x,
    y,
    w: Math.min(1, rect.x + rect.w) - x,
    h: Math.min(1, rect.y + rect.h) - y,
  };
}

/**
 * Moves a region to a new box (percents). If it follows pinned positions, the position at
 * `time` is pinned too, so the region stays where it was put.
 */
function place(
  r: Region,
  box: { x: number; y: number; w: number; h: number },
  time: number,
): Region {
  const keys = r.keys.length
    ? [...r.keys.filter((k) => Math.abs(k.t - time) > 0.05), { t: time, x: box.x, y: box.y }]
    : [];
  return { ...r, ...box, keys };
}

/** Where a region is at time t (percent), following its keys. */
function positionAt(r: Region, t: number): { x: number; y: number } {
  const k = [...r.keys].sort((a, b) => a.t - b.t);
  if (!k.length) return { x: r.x, y: r.y };
  if (t <= k[0]!.t) return k[0]!;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i]!;
    const b = k[i + 1]!;
    if (t < b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return k[k.length - 1]!;
}

/** A white-on-transparent shape the size of the region, used to give it round or soft edges. */
async function maskPng(r: Region, pw: number, ph: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, pw, ph);
  const feather = r.soft ? Math.min(pw, ph) * 0.12 : 0;
  ctx.filter = feather ? `blur(${feather / 2}px)` : "none";
  ctx.fillStyle = "white";
  ctx.beginPath();
  if (isDrawn(r)) {
    for (const pt of r.points) {
      ctx.lineTo(feather + pt.x * (pw - feather * 2), feather + pt.y * (ph - feather * 2));
    }
    ctx.closePath();
  } else if (r.shape === "ellipse") {
    ctx.ellipse(pw / 2, ph / 2, pw / 2 - feather, ph / 2 - feather, 0, 0, Math.PI * 2);
  } else ctx.rect(feather, feather, pw - feather * 2, ph - feather * 2);
  ctx.fill();
  return new File([await canvasToBlob(canvas)], `mask${r.id}.png`, { type: "image/png" });
}

export default function BlurRegion() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [active, setActive] = useState(0);
  const [time, setTime] = useState(0);
  const [sound, setSound] = useState<"keep" | "mute" | "bleep">("keep");
  /** Drawing a hand-drawn shape for the active region, and the line so far (percents). */
  const [drawing, setDrawing] = useState(false);
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const video = media?.info.video[0];
  const duration = media?.info.duration ?? 0;
  const region = regions[active];
  const update = (patch: Partial<Region>) =>
    setRegions(regions.map((r, i) => (i === active ? { ...r, ...patch } : r)));
  const select = (i: number) => {
    setActive(i);
    setDrawing(false);
  };
  const add = () => {
    setRegions([
      ...regions,
      {
        id: nextId++,
        shape: "rect",
        points: [],
        effect: "blur",
        soft: true,
        x: 35,
        y: 35,
        w: 30,
        h: 30,
        keys: [],
        start: 0,
        end: duration,
      },
    ]);
    select(regions.length);
  };

  const startDrag = (e: ReactPointerEvent<HTMLElement>, i: number, mode: "move" | Corner) => {
    const r = regions[i];
    const frame = stage.current?.getBoundingClientRect();
    if (!r || !frame || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select(i);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const at = positionAt(r, time);
    const origin = { x: e.clientX, y: e.clientY, t: time };
    const rect = { x: at.x / 100, y: at.y / 100, w: r.w / 100, h: r.h / 100 };
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - origin.x) / frame.width;
      const dy = (ev.clientY - origin.y) / frame.height;
      const next = inFrame(
        mode === "move" ? moveRect(rect, dx, dy) : resizeRect(rect, mode, dx, dy, ev.shiftKey),
      );
      const box = { x: next.x * 100, y: next.y * 100, w: next.w * 100, h: next.h * 100 };
      setRegions((all) => all.map((x) => (x.id === r.id ? place(x, box, origin.t) : x)));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  /** Where a pointer is over the video, as percents of the frame. */
  const pointAt = (e: ReactPointerEvent) => {
    const frame = stage.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return {
      x: clamp(((e.clientX - frame.left) / frame.width) * 100),
      y: clamp(((e.clientY - frame.top) / frame.height) * 100),
    };
  };

  const finishStroke = () => {
    const pts = stroke;
    setStroke(null);
    if (!pts || pts.length < 3 || !region) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const box = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    if (box.w < 1 || box.h < 1) return;
    const points = pts.map((p) => ({ x: (p.x - box.x) / box.w, y: (p.y - box.y) / box.h }));
    setRegions(regions.map((r, i) => (i === active ? { ...place(r, box, time), points } : r)));
    setDrawing(false);
  };

  const slider = (label: string, key: "x" | "y" | "w" | "h") =>
    region && (
      <Field label={`${label}: ${Math.round(region[key])}%`}>
        <input
          type="range"
          min={key === "w" || key === "h" ? 2 : 0}
          max={100}
          value={region[key]}
          onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<Region>)}
          className="w-full accent-black"
          aria-label={label}
        />
      </Field>
    );

  const settings = media && video && (
    <>
      <PanelSection title="regions">
        <Button onClick={add}>
          <Plus className="size-4" /> add a region
        </Button>
        {region && (
          <>
            <Segmented
              label="Effect"
              value={region.effect}
              onChange={(effect) => update({ effect })}
              options={[
                { value: "blur", label: "blur" },
                { value: "pixelate", label: "pixelate" },
                { value: "solid", label: "black box" },
              ]}
            />
            <Segmented
              label="Shape"
              value={region.shape}
              onChange={(shape) => {
                update({ shape });
                setDrawing(shape === "free" && !region.points.length);
              }}
              options={[
                { value: "rect", label: "rectangle" },
                { value: "ellipse", label: "ellipse" },
                { value: "free", label: "hand-drawn" },
              ]}
            />
            {region.shape === "free" &&
              (drawing ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-3">
                    Draw around what you want to hide, right on the video.
                  </p>
                  {region.points.length > 0 && (
                    <Button variant="ghost" onClick={() => setDrawing(false)}>
                      keep the old shape
                    </Button>
                  )}
                </div>
              ) : (
                <Button onClick={() => setDrawing(true)}>
                  {region.points.length ? "draw it again" : "draw the shape"}
                </Button>
              ))}
            <Checkbox
              checked={region.soft}
              onChange={(soft) => update({ soft })}
              label="soft edges"
            />
            {slider("left", "x")}
            {slider("top", "y")}
            {slider("width", "w")}
            {slider("height", "h")}
            <RangeFields
              start={region.start}
              end={region.end}
              duration={duration}
              onChange={(r) => update(r)}
            />
            <div className="space-y-1">
              <Button
                onClick={() =>
                  update({
                    keys: [
                      ...region.keys.filter((k) => Math.abs(k.t - time) > 0.05),
                      { t: time, x: region.x, y: region.y },
                    ],
                  })
                }
              >
                pin this position at {formatTime(time)}
              </Button>
              <p className="text-xs text-ink-3">
                For something that moves: pin its position at a few times and the region slides
                between them.
              </p>
              {region.keys.length > 0 && (
                <Button variant="ghost" onClick={() => update({ keys: [] })}>
                  clear {region.keys.length} pinned positions
                </Button>
              )}
            </div>
          </>
        )}
      </PanelSection>
      {media.info.audio.length > 0 && (
        <PanelSection title="sound while hidden">
          <Select
            label="Sound"
            value={sound}
            onChange={setSound}
            options={[
              { value: "keep", label: "keep it" },
              { value: "mute", label: "mute it" },
              { value: "bleep", label: "bleep it" },
            ]}
          />
        </PanelSection>
      )}
    </>
  );

  const jobs = async () => {
    const W = video!.width;
    const H = video!.height;
    const masks: File[] = [];
    const parts: string[] = [];
    let base = "0:v";
    for (const [i, r] of regions.entries()) {
      const pw = Math.min(even((r.w / 100) * W), W - (W % 2));
      const ph = Math.min(even((r.h / 100) * H), H - (H % 2));
      const keys = r.keys.length ? r.keys : [{ t: 0, x: r.x, y: r.y }];
      const xe = lerpExpr(keys.map((k) => ({ t: k.t, v: Math.min((k.x / 100) * W, W - pw) })));
      const ye = lerpExpr(keys.map((k) => ({ t: k.t, v: Math.min((k.y / 100) * H, H - ph) })));
      const radius = Math.max(1, Math.min(30, Math.floor(Math.min(pw, ph) / 4) - 1));
      const effect =
        r.effect === "blur"
          ? `boxblur=luma_radius=${radius}:luma_power=3:chroma_radius=${Math.max(1, Math.floor(radius / 2))}:chroma_power=3`
          : r.effect === "pixelate"
            ? `scale=${Math.max(1, Math.round(pw / 16))}:${Math.max(1, Math.round(ph / 16))},scale=${pw}:${ph}:flags=neighbor`
            : `drawbox=x=0:y=0:w=${pw}:h=${ph}:color=black:t=fill`;
      parts.push(
        `[${base}]split[a${i}][b${i}]`,
        `[b${i}]crop=${pw}:${ph}:'${xe}':'${ye}',${effect}[e${i}]`,
      );
      let piece = `e${i}`;
      if (r.shape !== "rect" || r.soft) {
        masks.push(await maskPng(r, pw, ph));
        const input = masks.length;
        parts.push(
          `[${input}:v]format=gray,scale=${pw}:${ph}[m${i}]`,
          `[e${i}]format=yuva420p[f${i}]`,
          `[f${i}][m${i}]alphamerge[g${i}]`,
        );
        piece = `g${i}`;
      }
      const out = i === regions.length - 1 ? "v" : `o${i}`;
      parts.push(
        `[a${i}][${piece}]overlay=x='${xe}':y='${ye}':enable='between(t,${r.start},${r.end})'[${out}]`,
      );
      base = out;
    }
    const when = regions.map((r) => `between(t,${r.start},${r.end})`).join("+");
    const hasAudio = media!.info.audio.length > 0;
    if (hasAudio && sound !== "keep") {
      const muted = `[0:a]volume=volume=0:enable='${when}'`;
      parts.push(
        sound === "mute"
          ? `${muted}[aout]`
          : `${muted}[am];sine=frequency=1000:sample_rate=48000:duration=${duration},volume=0.25,volume=volume=0:enable='not(${when})'[bp];[am][bp]amix=inputs=2:duration=first:normalize=0[aout]`,
      );
    }
    return [
      {
        duration,
        mime: "video/mp4",
        name: outputName(media!.file.name, "blurred", "mp4"),
        extraInputs: masks,
        args: ([input, ...rest]: string[]) => [
          "-i",
          input!,
          ...rest.flatMap((p) => ["-loop", "1", "-t", String(duration), "-i", p]),
          "-filter_complex",
          parts.join(";"),
          "-map",
          "[v]",
          ...(hasAudio ? ["-map", sound === "keep" ? "0:a:0" : "[aout]"] : []),
          ...ENCODE_MP4,
          "/out/blurred.mp4",
        ],
      },
    ];
  };

  return (
    <EnginePage
      toolId="blur-region"
      subtitle="Blur certain regions of video"
      media={media ? [media] : []}
      onMedia={(files) => {
        if (!files[0]) return;
        setMedia(files[0]);
        setRegions([]);
      }}
      settings={settings}
      action="hide regions"
      running="hiding regions…"
      disabled={(!video && "This file has no video.") || (!regions.length && "Add a region first.")}
      jobs={jobs}
    >
      {media && video && (
        <>
          <OverlayPreview
            onRemove={() => setMedia(null)}
            file={media.file}
            width={video.width}
            height={video.height}
            onTime={setTime}
          >
            <div ref={stage} className="absolute inset-0">
              {regions.map((r, i) => {
                if (time < r.start || time > r.end) return null;
                const at = positionAt(r, time);
                const drawn = isDrawn(r);
                const isActive = i === active;
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={-1}
                    aria-label={`Region ${i + 1}`}
                    onPointerDown={(e) => startDrag(e, i, "move")}
                    className={`pointer-events-auto absolute cursor-move touch-none ${
                      isActive
                        ? drawn
                          ? "z-10 outline-1 outline-accent outline-dashed"
                          : "z-10 outline-2 outline-accent"
                        : ""
                    }`}
                    style={{
                      left: `${at.x}%`,
                      top: `${at.y}%`,
                      width: `${r.w}%`,
                      height: `${r.h}%`,
                      borderRadius: drawn ? 0 : r.shape === "ellipse" ? "50%" : r.soft ? "12%" : 0,
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        borderRadius: "inherit",
                        clipPath: drawn
                          ? `polygon(${r.points.map((p) => `${p.x * 100}% ${p.y * 100}%`).join(",")})`
                          : undefined,
                        background: r.effect === "solid" ? "black" : undefined,
                        backdropFilter:
                          r.effect === "solid"
                            ? undefined
                            : `blur(${r.effect === "pixelate" ? 6 : 12}px)`,
                      }}
                    />
                    {drawn && isActive && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 size-full overflow-visible"
                      >
                        <polygon
                          points={r.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                          className="fill-none stroke-accent"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                    {isActive &&
                      CORNERS.map((corner) => (
                        <span
                          key={corner}
                          onPointerDown={(e) => startDrag(e, i, corner)}
                          className={`absolute size-3 touch-none rounded-[2px] border-2 border-ink bg-accent ${cornerClass[corner]}`}
                        />
                      ))}
                  </div>
                );
              })}
              {drawing && (
                <div
                  aria-label="Draw the region"
                  className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair touch-none bg-black/20"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setStroke([pointAt(e)]);
                  }}
                  onPointerMove={(e) => {
                    if (!stroke) return;
                    const p = pointAt(e);
                    const last = stroke[stroke.length - 1]!;
                    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) setStroke([...stroke, p]);
                  }}
                  onPointerUp={finishStroke}
                  onPointerCancel={() => setStroke(null)}
                >
                  {stroke && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 size-full"
                    >
                      <polyline
                        points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
                        className="fill-white/20 stroke-accent"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                </div>
              )}
            </div>
          </OverlayPreview>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {regions.map((r, i) => (
                <span
                  key={r.id}
                  className={`inline-flex items-center gap-1 rounded-md border-3 border-ink px-2 py-1 text-sm ${
                    i === active ? "bg-accent" : "bg-card"
                  }`}
                >
                  <button type="button" onClick={() => select(i)}>
                    region {i + 1}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove region"
                    onClick={() => {
                      setRegions(regions.filter((_, k) => k !== i));
                      select(0);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </EnginePage>
  );
}
