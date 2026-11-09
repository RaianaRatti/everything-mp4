import { useState } from "react";
import { CropPreview } from "../../components/CropPreview";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Button, Field, PanelSection, Select, inputClass } from "../../components/ui";
import { ENCODE_MP4, detectCrop, even } from "../../lib/ffmpeg/edit";
import { useEngine } from "../../lib/ffmpeg/engine";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

const ASPECTS = [
  { value: "free", label: "free" },
  { value: "16:9", label: "16:9 (wide)" },
  { value: "9:16", label: "9:16 (tall)" },
  { value: "1:1", label: "1:1 (square)" },
  { value: "4:5", label: "4:5 (portrait)" },
  { value: "4:3", label: "4:3" },
  { value: "21:9", label: "21:9 (cinema)" },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The biggest centered box with this aspect ratio, with even sizes. */
function centered(src: { width: number; height: number }, aspect: string): Box {
  const [a, b] = aspect.split(":").map(Number) as [number, number];
  let width = src.width;
  let height = (width * b) / a;
  if (height > src.height) {
    height = src.height;
    width = (height * a) / b;
  }
  width = Math.min(even(width), src.width - (src.width % 2));
  height = Math.min(even(height), src.height - (src.height % 2));
  return {
    x: Math.round((src.width - width) / 2),
    y: Math.round((src.height - height) / 2),
    width,
    height,
  };
}

export default function Crop() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [aspect, setAspect] = useState("free");
  const [box, setBox] = useState<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const engineReady = useEngine((s) => s.status === "ready");
  const player = usePlayer();

  const video = media?.info.video[0];
  const src = video ? { width: video.width, height: video.height } : { width: 0, height: 0 };

  const set = (patch: Partial<Box>) => {
    const next = { ...box, ...patch };
    next.width = Math.min(even(next.width), src.width);
    next.height = Math.min(even(next.height), src.height);
    next.x = Math.max(0, Math.min(Math.round(next.x), src.width - next.width));
    next.y = Math.max(0, Math.min(Math.round(next.y), src.height - next.height));
    setBox(next);
  };

  const autoBars = async () => {
    if (!media) return;
    setDetecting(true);
    try {
      const found = await detectCrop(media.file, media.info.duration, new AbortController().signal);
      if (found && (found.width < src.width || found.height < src.height)) {
        setAspect("free");
        setBox({ ...found, width: even(found.width - 1), height: even(found.height - 1) });
        setNote(`Found black bars; the picture is ${found.width}×${found.height}.`);
      } else setNote("No black bars found.");
    } finally {
      setDetecting(false);
    }
  };

  const num = (label: string, key: keyof Box) => (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={box[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Box>)}
        className={inputClass}
      />
    </Field>
  );

  const settings = media && video && (
    <PanelSection title="crop">
      <Field label="shape">
        <Select
          label="Shape"
          value={aspect}
          onChange={(v) => {
            setAspect(v);
            if (v !== "free") setBox(centered(src, v));
          }}
          options={ASPECTS}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {num("left", "x")}
        {num("top", "y")}
        {num("width", "width")}
        {num("height", "height")}
      </div>
      <Button disabled={!engineReady || detecting} onClick={() => void autoBars()}>
        {detecting ? "looking…" : "auto-remove black bars"}
      </Button>
      {note && <p className="text-xs text-ink-3">{note}</p>}
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="crop"
      subtitle="Cut away edges from video"
      media={media ? [media] : []}
      onMedia={(files) => {
        const next = files[0];
        const v = next?.info.video[0];
        if (!next || !v) return;
        setMedia(next);
        setAspect("free");
        setNote(null);
        setBox({ x: 0, y: 0, width: v.width - (v.width % 2), height: v.height - (v.height % 2) });
      }}
      settings={settings}
      action="crop"
      running="cropping…"
      disabled={!video && "This file has no video."}
      jobs={() => [
        {
          duration: media!.info.duration,
          mime: "video/mp4",
          name: outputName(media!.file.name, "cropped", "mp4"),
          args: ([input]) => [
            "-i",
            input!,
            "-vf",
            `crop=${box.width}:${box.height}:${box.x}:${box.y},setsar=1`,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            ...ENCODE_MP4,
            "/out/cropped.mp4",
          ],
        },
      ]}
    >
      {media && video && (
        <>
          <Player media={media} player={player} onRemove={() => setMedia(null)} />
          {media.info.canPlay && <CropPreview file={media.file} source={src} box={box} />}
        </>
      )}
    </EnginePage>
  );
}
