import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Field, PanelSection, Select, inputClass } from "../../components/ui";
import { ENCODE_MP4, even, fitGraph, type FitMode } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

type By = "preset" | "width" | "height" | "percent" | "custom";

const PRESETS = [
  { value: "2160", label: "4K (2160p)" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

const PADS: { value: FitMode | "color"; label: string }[] = [
  { value: "bars", label: "black bars" },
  { value: "color", label: "colored bars" },
  { value: "blur", label: "blurred video" },
  { value: "crop", label: "crop to fill" },
  { value: "stretch", label: "stretch" },
];

export default function Resize() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [by, setBy] = useState<By>("preset");
  const [preset, setPreset] = useState(720);
  const [value, setValue] = useState(1280);
  const [percent, setPercent] = useState(50);
  const [custom, setCustom] = useState({ width: 1080, height: 1080 });
  const [pad, setPad] = useState<FitMode | "color">("bars");
  const [color, setColor] = useState("#ffffff");
  const player = usePlayer();

  const video = media?.info.video[0];
  const sw = video?.width ?? 1;
  const sh = video?.height ?? 1;
  const aspect = sw / sh;
  // Presets set the short side, like "1080p" does for both wide and tall videos.
  const size =
    by === "preset"
      ? sw >= sh
        ? { width: preset * aspect, height: preset }
        : { width: preset, height: preset / aspect }
      : by === "width"
        ? { width: value, height: value / aspect }
        : by === "height"
          ? { width: value * aspect, height: value }
          : by === "percent"
            ? { width: (sw * percent) / 100, height: (sh * percent) / 100 }
            : custom;
  const out = { width: even(size.width), height: even(size.height) };
  const changesShape = by === "custom" && Math.abs(out.width / out.height - aspect) > 0.01;

  const settings = media && video && (
    <PanelSection title="resize">
      <Select
        label="Resize by"
        value={by}
        onChange={setBy}
        options={[
          { value: "preset", label: "preset" },
          { value: "width", label: "width" },
          { value: "height", label: "height" },
          { value: "percent", label: "percent" },
          { value: "custom", label: "custom size (change shape)" },
        ]}
      />
      {by === "preset" && (
        <Select
          label="Preset"
          value={String(preset)}
          onChange={(v) => setPreset(Number(v))}
          options={PRESETS}
        />
      )}
      {(by === "width" || by === "height") && (
        <Field label={`${by} in pixels`}>
          <input
            type="number"
            min={16}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      )}
      {by === "percent" && (
        <Field label={`${percent}%`}>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Percent"
          />
        </Field>
      )}
      {by === "custom" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="width">
              <input
                type="number"
                min={16}
                value={custom.width}
                onChange={(e) => setCustom({ ...custom, width: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="height">
              <input
                type="number"
                min={16}
                value={custom.height}
                onChange={(e) => setCustom({ ...custom, height: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
          </div>
          {changesShape && (
            <Field label="fill the extra space with">
              <Select label="Fill" value={pad} onChange={setPad} options={PADS} />
            </Field>
          )}
          {changesShape && pad === "color" && (
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Bar color"
            />
          )}
        </>
      )}
      <p className="text-sm">
        {sw}×{sh} → {out.width}×{out.height}
      </p>
    </PanelSection>
  );

  const graph = changesShape
    ? fitGraph("0:v", "v", out.width, out.height, pad === "color" ? "bars" : pad, {
        color: pad === "color" ? color.replace("#", "0x") : "black",
      })
    : `[0:v]scale=${out.width}:${out.height},setsar=1[v]`;

  return (
    <EnginePage
      toolId="resize"
      subtitle="Make video smaller or larger"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action="resize"
      running="resizing…"
      disabled={!video && "This file has no video."}
      jobs={() => [
        {
          duration: media!.info.duration,
          mime: "video/mp4",
          name: outputName(media!.file.name, "resized", "mp4"),
          args: ([input]) => [
            "-i",
            input!,
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            "-map",
            "0:a:0?",
            ...ENCODE_MP4,
            "/out/resized.mp4",
          ],
        },
      ]}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
    </EnginePage>
  );
}
