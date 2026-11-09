import { Plus, X } from "lucide-react";
import { useState } from "react";
import { EnginePage } from "../../components/EnginePage";
import { FilePickerButton } from "../../components/FileDrop";
import { LayerCanvas } from "../../components/LayerCanvas";
import { OverlayPreview } from "../../components/OverlayPreview";
import { RangeFields } from "../../components/RangeFields";
import { Advanced, Button, Checkbox, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import { ENCODE_MP4 } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import {
  FONTS,
  addFont,
  layerInputs,
  layerPng,
  overlayGraph,
  type Anim,
  type TextLayer,
} from "../../lib/overlays/layers";

let nextId = 1;

type Template = "title" | "lower" | "caption" | "end";

function fromTemplate(t: Template, duration: number): TextLayer {
  const base: TextLayer = {
    id: nextId++,
    kind: "text",
    text: "your text",
    font: FONTS[1]!.value,
    size: 8,
    color: "#ffffff",
    outline: 0,
    outlineColor: "#000000",
    shadow: true,
    box: false,
    boxColor: "#000000aa",
    align: "center",
    wrap: 80,
    x: 50,
    y: 50,
    rotation: 0,
    opacity: 1,
    start: 0,
    end: Math.min(duration, 5),
    anim: "fade",
  };
  if (t === "lower")
    return { ...base, text: "Name\nrole", size: 5, align: "left", x: 6, y: 80, box: true, anim: "slide" };
  if (t === "caption") return { ...base, text: "caption", size: 5, y: 88, box: true, end: duration };
  if (t === "end")
    return { ...base, text: "thanks for watching", size: 9, start: Math.max(0, duration - 5), end: duration };
  return { ...base, text: "title", size: 12, outline: 8 };
}

export default function AddText() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [active, setActive] = useState(0);
  const [time, setTime] = useState(0);
  const [fonts, setFonts] = useState(FONTS);

  const video = media?.info.video[0];
  const duration = media?.info.duration ?? 0;
  const layer = layers[active];
  const update = (patch: Partial<TextLayer>) =>
    setLayers(layers.map((l, i) => (i === active ? { ...l, ...patch } : l)));
  const add = (t: Template) => {
    setLayers([...layers, fromTemplate(t, duration)]);
    setActive(layers.length);
  };

  const num = (label: string, key: "x" | "y" | "size" | "rotation" | "wrap" | "outline", min: number, max: number) =>
    layer && (
      <Field label={`${label}: ${layer[key]}`}>
        <input
          type="range"
          min={min}
          max={max}
          value={layer[key]}
          onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<TextLayer>)}
          className="w-full accent-black"
          aria-label={label}
        />
      </Field>
    );

  const settings = media && video && (
    <>
      <PanelSection title="add">
        <div className="grid grid-cols-2 gap-1">
          <Button onClick={() => add("title")}>
            <Plus className="size-4" /> title
          </Button>
          <Button onClick={() => add("lower")}>
            <Plus className="size-4" /> lower third
          </Button>
          <Button onClick={() => add("caption")}>
            <Plus className="size-4" /> caption
          </Button>
          <Button onClick={() => add("end")}>
            <Plus className="size-4" /> end card
          </Button>
        </div>
      </PanelSection>
      {layer && (
        <PanelSection title={`text ${active + 1}`}>
          <textarea
            value={layer.text}
            onChange={(e) => update({ text: e.target.value })}
            rows={2}
            className={inputClass}
            aria-label="Text"
          />
          <Field label="font">
            <Select
              label="Font"
              value={layer.font}
              onChange={(font) => update({ font })}
              options={fonts}
            />
          </Field>
          <FilePickerButton
            accept=".ttf,.otf,.woff,.woff2"
            onFiles={(files) => {
              const file = files[0];
              if (!file) return;
              void addFont(file).then((font) => {
                setFonts((f) => [...f, { value: font, label: file.name }]);
                update({ font });
              });
            }}
          >
            use my own font
          </FilePickerButton>
          {num("size", "size", 2, 30)}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              color
              <input type="color" value={layer.color} onChange={(e) => update({ color: e.target.value })} />
            </label>
            <Checkbox checked={layer.box} onChange={(box) => update({ box })} label="box" />
            <Checkbox checked={layer.shadow} onChange={(shadow) => update({ shadow })} label="shadow" />
          </div>
          <Segmented
            label="Alignment"
            value={layer.align}
            onChange={(align) => update({ align })}
            options={[
              { value: "left", label: "left" },
              { value: "center", label: "center" },
              { value: "right", label: "right" },
            ]}
          />
          {num("left ↔ right", "x", 0, 100)}
          {num("top ↕ bottom", "y", 0, 100)}
          <RangeFields
            start={layer.start}
            end={layer.end}
            duration={duration}
            onChange={(r) => update(r)}
          />
          <Field label="animation">
            <Segmented
              label="Animation"
              value={layer.anim}
              onChange={(anim: Anim) => update({ anim })}
              options={[
                { value: "none", label: "none" },
                { value: "fade", label: "fade" },
                { value: "slide", label: "slide" },
              ]}
            />
          </Field>
          <Advanced>
            {num("outline", "outline", 0, 30)}
            {layer.outline > 0 && (
              <input
                type="color"
                value={layer.outlineColor}
                onChange={(e) => update({ outlineColor: e.target.value })}
                aria-label="Outline color"
              />
            )}
            {num("rotation", "rotation", -45, 45)}
            {num("wrap width", "wrap", 10, 100)}
            <Field label={`opacity: ${Math.round(layer.opacity * 100)}%`}>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={layer.opacity}
                onChange={(e) => update({ opacity: Number(e.target.value) })}
                className="w-full accent-black"
                aria-label="Opacity"
              />
            </Field>
            {layer.box && (
              <label className="flex items-center gap-1 text-sm">
                box color
                <input
                  type="color"
                  value={layer.boxColor.slice(0, 7)}
                  onChange={(e) => update({ boxColor: `${e.target.value}aa` })}
                />
              </label>
            )}
          </Advanced>
        </PanelSection>
      )}
    </>
  );

  return (
    <EnginePage
      toolId="add-text"
      subtitle="Put titles, captions, end cards"
      media={media ? [media] : []}
      onMedia={(files) => {
        const next = files[0];
        if (!next) return;
        setMedia(next);
        setLayers([fromTemplate("title", next.info.duration)]);
        setActive(0);
      }}
      settings={settings}
      action="add text"
      running="adding text…"
      disabled={(!video && "This file has no video.") || (!layers.length && "Add some text first.")}
      jobs={async () => {
        const w = video!.width;
        const h = video!.height;
        const pngs = await Promise.all(layers.map((l) => layerPng(l, w, h)));
        return [
          {
            duration,
            mime: "video/mp4",
            name: outputName(media!.file.name, "text", "mp4"),
            extraInputs: pngs,
            args: ([input, ...rest]) => [
              "-i",
              input!,
              ...layerInputs(rest, duration),
              "-filter_complex",
              overlayGraph(layers),
              "-map",
              "[v]",
              "-map",
              "0:a:0?",
              ...ENCODE_MP4,
              "/out/text.mp4",
            ],
          },
        ];
      }}
    >
      {media && video && (
        <>
          <OverlayPreview onRemove={() => setMedia(null)} file={media.file} width={video.width} height={video.height} onTime={setTime}>
            <LayerCanvas layers={layers} width={video.width} height={video.height} time={time} />
          </OverlayPreview>
          {layers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {layers.map((l, i) => (
                <span
                  key={l.id}
                  className={`inline-flex items-center gap-1 rounded-md border-3 border-ink px-2 py-1 text-sm ${
                    i === active ? "bg-accent" : "bg-card"
                  }`}
                >
                  <button type="button" onClick={() => setActive(i)} className="max-w-40 truncate">
                    {l.text.split("\n")[0] || "(empty)"}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove text"
                    onClick={() => {
                      setLayers(layers.filter((_, k) => k !== i));
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
