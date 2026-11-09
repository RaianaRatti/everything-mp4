import { useEffect, useState } from "react";
import { EnginePage } from "../../components/EnginePage";
import { FilePickerButton } from "../../components/FileDrop";
import { LayerCanvas } from "../../components/LayerCanvas";
import { OverlayPreview } from "../../components/OverlayPreview";
import { RangeFields } from "../../components/RangeFields";
import { Button, Checkbox, Field, PanelSection, Segmented, inputClass } from "../../components/ui";
import { ENCODE_MP4 } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import {
  FONTS,
  layerInputs,
  layerPng,
  overlayGraph,
  type Layer,
} from "../../lib/overlays/layers";

type Corner = "tl" | "tr" | "bl" | "br" | "c";

/** Saved settings, so the same watermark can be used again (and by batch). */
export interface WatermarkPreset {
  kind: "image" | "text";
  /** The image as a data URL. */
  image: string | null;
  text: string;
  corner: Corner;
  margin: number;
  size: number;
  opacity: number;
  tiled: boolean;
}

export const PRESET_KEY = "everything-mp4-watermark";

export function loadPreset(): WatermarkPreset | null {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    return raw ? (JSON.parse(raw) as WatermarkPreset) : null;
  } catch {
    return null;
  }
}

/** Turns watermark settings into a layer for a w×h frame. */
export async function watermarkLayer(
  p: WatermarkPreset,
  w: number,
  h: number,
  range: { start: number; end: number },
): Promise<Layer> {
  const half = p.size / 2;
  const mx = p.margin;
  const my = (p.margin * w) / h;
  const x = p.corner === "tl" || p.corner === "bl" ? mx + half : p.corner === "c" ? 50 : 100 - mx - half;
  const base = { id: 1, x, y: 50, rotation: 0, opacity: p.opacity, ...range, anim: "none" as const };
  if (p.kind === "image" && p.image) {
    const image = await createImageBitmap(await (await fetch(p.image)).blob());
    const ih = ((p.size / 100) * w * image.height) / image.width / h * 100;
    const y = p.corner === "tl" || p.corner === "tr" ? my + ih / 2 : p.corner === "c" ? 50 : 100 - my - ih / 2;
    return { ...base, kind: "image", image, width: p.size, tiled: p.tiled, y, rotation: p.tiled ? -20 : 0 };
  }
  const size = Math.max(2, p.size / 5);
  const y = p.corner === "tl" || p.corner === "tr" ? my + size : p.corner === "c" ? 50 : 100 - my - size;
  return {
    ...base,
    kind: "text",
    text: p.text,
    font: FONTS[1]!.value,
    size,
    color: "#ffffff",
    outline: 6,
    outlineColor: "#000000",
    shadow: false,
    box: false,
    boxColor: "#000000",
    align: "center",
    wrap: 90,
    y,
  };
}

const DEFAULT: WatermarkPreset = {
  kind: "text",
  image: null,
  text: "© me",
  corner: "br",
  margin: 3,
  size: 20,
  opacity: 0.7,
  tiled: false,
};

export default function Watermark() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [p, setP] = useState<WatermarkPreset>(() => loadPreset() ?? DEFAULT);
  const [partOnly, setPartOnly] = useState(false);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [layer, setLayer] = useState<{ key: string; layer: Layer } | null>(null);
  const [time, setTime] = useState(0);
  const [saved, setSaved] = useState(false);

  const video = media?.info.video[0];
  const duration = media?.info.duration ?? 0;
  const span = partOnly ? range : { start: 0, end: duration };
  const update = (patch: Partial<WatermarkPreset>) => {
    setP({ ...p, ...patch });
    setSaved(false);
  };

  // Building the layer is async (images load), so it's rebuilt when the settings change.
  const key = JSON.stringify([p, span, video?.width, video?.height]);
  const width = video?.width;
  const height = video?.height;
  useEffect(() => {
    if (!width || !height) return;
    let live = true;
    const [preset, part] = JSON.parse(key) as [WatermarkPreset, { start: number; end: number }];
    void watermarkLayer(preset, width, height, part).then((l) => live && setLayer({ key, layer: l }));
    return () => {
      live = false;
    };
  }, [key, width, height]);

  const settings = media && video && (
    <PanelSection title="watermark">
      <Segmented
        label="Kind"
        value={p.kind}
        onChange={(kind) => update({ kind })}
        options={[
          { value: "text", label: "text" },
          { value: "image", label: "image" },
        ]}
      />
      {p.kind === "text" ? (
        <input
          value={p.text}
          onChange={(e) => update({ text: e.target.value })}
          className={inputClass}
          aria-label="Watermark text"
        />
      ) : (
        <FilePickerButton
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onFiles={(files) => {
            const file = files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => update({ image: String(reader.result) });
            reader.readAsDataURL(file);
          }}
        >
          {p.image ? "change image" : "pick an image (PNG, JPEG, WebP, SVG)"}
        </FilePickerButton>
      )}
      <Field label="where">
        <Segmented
          label="Where"
          value={p.corner}
          onChange={(corner) => update({ corner })}
          options={[
            { value: "tl", label: "↖" },
            { value: "tr", label: "↗" },
            { value: "c", label: "center" },
            { value: "bl", label: "↙" },
            { value: "br", label: "↘" },
          ]}
        />
      </Field>
      <Field label={`size: ${p.size}%`}>
        <input
          type="range"
          min={5}
          max={60}
          value={p.size}
          onChange={(e) => update({ size: Number(e.target.value) })}
          className="w-full accent-black"
          aria-label="Size"
        />
      </Field>
      <Field label={`margin: ${p.margin}%`}>
        <input
          type="range"
          min={0}
          max={15}
          value={p.margin}
          onChange={(e) => update({ margin: Number(e.target.value) })}
          className="w-full accent-black"
          aria-label="Margin"
        />
      </Field>
      <Field label={`opacity: ${Math.round(p.opacity * 100)}%`}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={p.opacity}
          onChange={(e) => update({ opacity: Number(e.target.value) })}
          className="w-full accent-black"
          aria-label="Opacity"
        />
      </Field>
      {p.kind === "image" && (
        <Checkbox checked={p.tiled} onChange={(tiled) => update({ tiled })} label="repeat across the video" />
      )}
      <Checkbox
        checked={partOnly}
        onChange={(v) => {
          setPartOnly(v);
          if (v && range.end === 0) setRange({ start: 0, end: duration });
        }}
        label="only show it for part of the video"
      />
      <Button
        onClick={() => {
          try {
            localStorage.setItem(PRESET_KEY, JSON.stringify(p));
            setSaved(true);
          } catch {
            // Storage can be full or blocked; the watermark still works.
          }
        }}
      >
        {saved ? "saved ✓" : "save as my watermark"}
      </Button>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="watermark"
      subtitle="Add your logo"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action="add watermark"
      running="adding watermark…"
      disabled={
        (!video && "This file has no video.") ||
        (p.kind === "image" && !p.image && "Pick an image first.") ||
        (!layer && "Getting ready…")
      }
      jobs={async () => {
        const l = await watermarkLayer(p, video!.width, video!.height, span);
        const png = await layerPng(l, video!.width, video!.height);
        return [
          {
            duration,
            mime: "video/mp4",
            name: outputName(media!.file.name, "watermarked", "mp4"),
            extraInputs: [png],
            args: ([input, ...rest]) => [
              "-i",
              input!,
              ...layerInputs(rest, duration),
              "-filter_complex",
              overlayGraph([l]),
              "-map",
              "[v]",
              "-map",
              "0:a:0?",
              ...ENCODE_MP4,
              "/out/watermarked.mp4",
            ],
          },
        ];
      }}
    >
      {media && video && (
        <>
          <OverlayPreview onRemove={() => setMedia(null)} file={media.file} width={video.width} height={video.height} onTime={setTime}>
            {layer && (
              <LayerCanvas layers={[layer.layer]} width={video.width} height={video.height} time={time} />
            )}
          </OverlayPreview>
          {partOnly && (
            <RangeFields start={range.start} end={range.end} duration={duration} onChange={setRange} />
          )}
        </>
      )}
    </EnginePage>
  );
}
