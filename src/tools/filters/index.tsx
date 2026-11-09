import { useState } from "react";
import { EnginePage } from "../../components/EnginePage";
import { OverlayPreview } from "../../components/OverlayPreview";
import { RangeFields } from "../../components/RangeFields";
import { Advanced, Checkbox, Field, PanelSection, Select } from "../../components/ui";
import { ENCODE_MP4, between } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  tint: number;
  hue: number;
  highlights: number;
  shadows: number;
  sharpen: number;
  vignette: number;
  blur: number;
  mono: "none" | "bw" | "sepia";
}

const NEUTRAL: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  highlights: 0,
  shadows: 0,
  sharpen: 0,
  vignette: 0,
  blur: 0,
  mono: "none",
};

const LOOKS: { id: string; label: string; adjust: Partial<Adjust> }[] = [
  { id: "none", label: "original", adjust: {} },
  { id: "warm", label: "warm", adjust: { temperature: 40, saturation: 10 } },
  { id: "cool", label: "cool", adjust: { temperature: -40, contrast: 5 } },
  { id: "faded", label: "faded", adjust: { contrast: -25, saturation: -30, shadows: 30 } },
  { id: "noir", label: "noir", adjust: { mono: "bw", contrast: 40, vignette: 50 } },
  { id: "vivid", label: "vivid", adjust: { saturation: 45, contrast: 15 } },
  { id: "retro", label: "retro", adjust: { temperature: 30, saturation: -20, contrast: -10, vignette: 40 } },
  { id: "bw", label: "black & white", adjust: { mono: "bw" } },
  { id: "sepia", label: "sepia", adjust: { mono: "sepia" } },
  { id: "dreamy", label: "dreamy", adjust: { brightness: 10, contrast: -15, blur: 10, saturation: 10 } },
  { id: "punchy", label: "punchy", adjust: { contrast: 30, sharpen: 40, saturation: 20 } },
];

const SLIDERS: { key: Exclude<keyof Adjust, "mono">; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "brightness", min: -100, max: 100 },
  { key: "contrast", label: "contrast", min: -100, max: 100 },
  { key: "saturation", label: "saturation", min: -100, max: 100 },
  { key: "exposure", label: "exposure", min: -100, max: 100 },
  { key: "temperature", label: "temperature", min: -100, max: 100 },
  { key: "tint", label: "tint", min: -100, max: 100 },
  { key: "hue", label: "hue", min: -180, max: 180 },
  { key: "highlights", label: "highlights", min: -100, max: 100 },
  { key: "shadows", label: "shadows", min: -100, max: 100 },
  { key: "sharpen", label: "sharpen", min: 0, max: 100 },
  { key: "vignette", label: "vignette", min: 0, max: 100 },
  { key: "blur", label: "blur", min: 0, max: 100 },
];

/** The ffmpeg filters for an adjustment, each limited to `range` when given. */
function ffmpegFilters(a: Adjust, range: { start: number; end: number } | null): string[] {
  const on = range ? `:enable=${between(range.start, range.end)}` : "";
  const f: string[] = [];
  if (a.brightness || a.contrast || a.saturation || a.exposure)
    f.push(
      `eq=brightness=${(a.brightness / 250).toFixed(3)}:contrast=${(1 + a.contrast / 100).toFixed(3)}:saturation=${(1 + a.saturation / 100).toFixed(3)}:gamma=${(2 ** (a.exposure / 60)).toFixed(3)}${on}`,
    );
  if (a.temperature || a.tint) {
    const t = (a.temperature / 300).toFixed(3);
    const bt = (-a.temperature / 300).toFixed(3);
    const g = (-a.tint / 300).toFixed(3);
    f.push(`colorbalance=rs=${t}:rm=${t}:rh=${t}:bs=${bt}:bm=${bt}:bh=${bt}:gm=${g}${on}`);
  }
  if (a.hue) f.push(`hue=h=${a.hue}${on}`);
  if (a.highlights || a.shadows)
    f.push(
      `curves=all='0/0 0.25/${(0.25 + a.shadows / 1000).toFixed(3)} 0.75/${(0.75 + a.highlights / 1000).toFixed(3)} 1/1'${on}`,
    );
  if (a.mono === "bw") f.push(`hue=s=0${on}`);
  if (a.mono === "sepia")
    f.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131${on}`);
  if (a.sharpen) f.push(`unsharp=5:5:${(a.sharpen / 50).toFixed(2)}${on}`);
  if (a.blur) f.push(`gblur=sigma=${(a.blur / 8).toFixed(2)}${on}`);
  if (a.vignette) f.push(`vignette=angle=${((a.vignette / 100) * (Math.PI / 2)).toFixed(3)}${on}`);
  return f;
}

/** A rough CSS match for the live preview. */
function cssFilter(a: Adjust): string {
  return [
    `brightness(${1 + a.brightness / 200 + a.exposure / 200})`,
    `contrast(${1 + a.contrast / 100})`,
    `saturate(${1 + a.saturation / 100})`,
    a.hue ? `hue-rotate(${a.hue}deg)` : "",
    a.mono === "bw" ? "grayscale(1)" : "",
    a.mono === "sepia" ? "sepia(1)" : "",
    a.temperature > 0 ? `sepia(${a.temperature / 300})` : "",
    a.blur ? `blur(${a.blur / 25}px)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Filters() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [adjust, setAdjust] = useState<Adjust>(NEUTRAL);
  const [look, setLook] = useState("none");
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [fadeColor, setFadeColor] = useState("black");
  const [partOnly, setPartOnly] = useState(false);
  const [range, setRange] = useState({ start: 0, end: 0 });

  const video = media?.info.video[0];
  const duration = media?.info.duration ?? 0;
  const filters = [
    ...ffmpegFilters(adjust, partOnly ? range : null),
    fadeIn > 0 ? `fade=in:st=0:d=${fadeIn}:color=${fadeColor}` : "",
    fadeOut > 0
      ? `fade=out:st=${Math.max(0, duration - fadeOut).toFixed(3)}:d=${fadeOut}:color=${fadeColor}`
      : "",
  ].filter(Boolean);

  const settings = media && video && (
    <>
      <PanelSection title="looks">
        <div className="grid grid-cols-3 gap-1">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={look === l.id}
              onClick={() => {
                setLook(l.id);
                setAdjust({ ...NEUTRAL, ...l.adjust });
              }}
              className={`rounded-md border-2 border-ink px-1 py-1.5 text-xs ${
                look === l.id ? "bg-accent" : "bg-card hover:bg-paper-2"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="fades">
        <div className="grid grid-cols-2 gap-2">
          <Field label={`fade in: ${fadeIn} s`}>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={fadeIn}
              onChange={(e) => setFadeIn(Number(e.target.value))}
              className="w-full accent-black"
              aria-label="Fade in seconds"
            />
          </Field>
          <Field label={`fade out: ${fadeOut} s`}>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={fadeOut}
              onChange={(e) => setFadeOut(Number(e.target.value))}
              className="w-full accent-black"
              aria-label="Fade out seconds"
            />
          </Field>
        </div>
        {(fadeIn > 0 || fadeOut > 0) && (
          <Select
            label="Fade color"
            value={fadeColor}
            onChange={setFadeColor}
            options={[
              { value: "black", label: "from black" },
              { value: "white", label: "from white" },
            ]}
          />
        )}
      </PanelSection>
      <PanelSection>
        <Advanced>
          {SLIDERS.map((s) => (
            <Field key={s.key} label={`${s.label}: ${adjust[s.key]}`}>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={adjust[s.key]}
                onChange={(e) => {
                  setLook("custom");
                  setAdjust({ ...adjust, [s.key]: Number(e.target.value) } as Adjust);
                }}
                className="w-full accent-black"
                aria-label={s.label}
              />
            </Field>
          ))}
          <Checkbox
            checked={partOnly}
            onChange={(v) => {
              setPartOnly(v);
              if (v && range.end === 0) setRange({ start: 0, end: duration });
            }}
            label="only change one part"
          />
        </Advanced>
      </PanelSection>
    </>
  );

  return (
    <EnginePage
      toolId="filters"
      subtitle="Change colors, add fades"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action="apply"
      running="applying filters…"
      disabled={(!video && "This file has no video.") || (!filters.length && "Pick a look or change something first.")}
      jobs={() => [
        {
          duration,
          mime: "video/mp4",
          name: outputName(media!.file.name, "filtered", "mp4"),
          args: ([input]) => [
            "-i",
            input!,
            "-vf",
            filters.join(","),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            ...ENCODE_MP4,
            "/out/filtered.mp4",
          ],
        },
      ]}
    >
      {media && video && (
        <>
          <OverlayPreview
            onRemove={() => setMedia(null)}
            file={media.file}
            width={video.width}
            height={video.height}
            videoStyle={{ filter: cssFilter(adjust) }}
          >
            {adjust.vignette > 0 && (
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at center, transparent ${70 - adjust.vignette / 3}%, rgba(0,0,0,${adjust.vignette / 120}) 100%)`,
                }}
              />
            )}
          </OverlayPreview>
          <p className="text-center text-xs text-ink-3">live preview (close to the result)</p>
          {partOnly && (
            <RangeFields start={range.start} end={range.end} duration={duration} onChange={setRange} />
          )}
        </>
      )}
    </EnginePage>
  );
}
