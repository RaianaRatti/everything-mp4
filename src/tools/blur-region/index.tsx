import { Plus, X } from "lucide-react";
import { useState } from "react";
import { EnginePage } from "../../components/EnginePage";
import { OverlayPreview } from "../../components/OverlayPreview";
import { RangeFields } from "../../components/RangeFields";
import { Button, Checkbox, Field, PanelSection, Segmented, Select } from "../../components/ui";
import { canvasToBlob } from "../../lib/gfx/canvas";
import { ENCODE_MP4, even, lerpExpr } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

type Effect = "blur" | "pixelate" | "solid";

interface Region {
  id: number;
  shape: "rect" | "ellipse";
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
  if (r.shape === "ellipse") ctx.ellipse(pw / 2, ph / 2, pw / 2 - feather, ph / 2 - feather, 0, 0, Math.PI * 2);
  else ctx.rect(feather, feather, pw - feather * 2, ph - feather * 2);
  ctx.fill();
  return new File([await canvasToBlob(canvas)], `mask${r.id}.png`, { type: "image/png" });
}

export default function BlurRegion() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [active, setActive] = useState(0);
  const [time, setTime] = useState(0);
  const [sound, setSound] = useState<"keep" | "mute" | "bleep">("keep");

  const video = media?.info.video[0];
  const duration = media?.info.duration ?? 0;
  const region = regions[active];
  const update = (patch: Partial<Region>) =>
    setRegions(regions.map((r, i) => (i === active ? { ...r, ...patch } : r)));
  const add = () => {
    setRegions([
      ...regions,
      {
        id: nextId++,
        shape: "rect",
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
    setActive(regions.length);
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
              onChange={(shape) => update({ shape })}
              options={[
                { value: "rect", label: "rectangle" },
                { value: "ellipse", label: "ellipse" },
              ]}
            />
            <Checkbox checked={region.soft} onChange={(soft) => update({ soft })} label="soft edges" />
            {slider("left", "x")}
            {slider("top", "y")}
            {slider("width", "w")}
            {slider("height", "h")}
            <RangeFields start={region.start} end={region.end} duration={duration} onChange={(r) => update(r)} />
            <div className="space-y-1">
              <Button
                onClick={() =>
                  update({
                    keys: [...region.keys.filter((k) => Math.abs(k.t - time) > 0.05), { t: time, x: region.x, y: region.y }],
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
      parts.push(`[${base}]split[a${i}][b${i}]`, `[b${i}]crop=${pw}:${ph}:'${xe}':'${ye}',${effect}[e${i}]`);
      let piece = `e${i}`;
      if (r.shape === "ellipse" || r.soft) {
        masks.push(await maskPng(r, pw, ph));
        const input = masks.length;
        parts.push(`[${input}:v]format=gray,scale=${pw}:${ph}[m${i}]`, `[e${i}]format=yuva420p[f${i}]`, `[f${i}][m${i}]alphamerge[g${i}]`);
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
          <OverlayPreview onRemove={() => setMedia(null)} file={media.file} width={video.width} height={video.height} onTime={setTime}>
            {regions.map((r, i) => {
              if (time < r.start || time > r.end) return null;
              const at = positionAt(r, time);
              return (
                <div
                  key={r.id}
                  className={`absolute ${i === active ? "outline-2 outline-accent" : ""}`}
                  style={{
                    left: `${at.x}%`,
                    top: `${at.y}%`,
                    width: `${r.w}%`,
                    height: `${r.h}%`,
                    borderRadius: r.shape === "ellipse" ? "50%" : r.soft ? "12%" : 0,
                    background: r.effect === "solid" ? "black" : undefined,
                    backdropFilter: r.effect === "solid" ? undefined : `blur(${r.effect === "pixelate" ? 6 : 12}px)`,
                  }}
                />
              );
            })}
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
                  <button type="button" onClick={() => setActive(i)}>
                    region {i + 1}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove region"
                    onClick={() => {
                      setRegions(regions.filter((_, k) => k !== i));
                      setActive(0);
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
