import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Checkbox, Field, PanelSection, Segmented } from "../../components/ui";
import { ENCODE_MP4, even, sameExtension, mimeFor } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

export default function Rotate() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [turn, setTurn] = useState(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [straighten, setStraighten] = useState(0);
  const [bake, setBake] = useState(false);
  const player = usePlayer();

  const video = media?.info.video[0];
  const ext = media ? sameExtension(media) : "mp4";
  // The rotation flag only exists in MP4/MOV, and can't flip or tilt.
  const canFlag = ["mp4", "mov", "m4v"].includes(ext) && !flipH && !flipV && !straighten;
  const lossless = canFlag && !bake;

  const filters = (): string => {
    const f: string[] = [];
    if (turn === 90) f.push("transpose=1");
    if (turn === 180) f.push("hflip,vflip");
    if (turn === 270) f.push("transpose=2");
    if (flipH) f.push("hflip");
    if (flipV) f.push("vflip");
    if (straighten && video) {
      const sideways = turn % 180 !== 0;
      const w = even(sideways ? video.height : video.width);
      const h = even(sideways ? video.width : video.height);
      const a = (Math.abs(straighten) * Math.PI) / 180;
      // Zoom in just enough that the tilted picture still covers the whole frame.
      const k = Math.max(
        Math.cos(a) + (h / w) * Math.sin(a),
        Math.cos(a) + (w / h) * Math.sin(a),
      );
      f.push(
        `scale=${even(w * k)}:${even(h * k)}`,
        `rotate=${((straighten * Math.PI) / 180).toFixed(5)}:ow=${w}:oh=${h}`,
      );
    }
    f.push("setsar=1");
    return f.join(",");
  };

  const settings = media && video && (
    <PanelSection title="rotate">
      <Segmented
        label="Turn"
        value={String(turn)}
        onChange={(v) => setTurn(Number(v))}
        options={[
          { value: "0", label: "0°" },
          { value: "90", label: "90° ↻" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° ↺" },
        ]}
      />
      <Checkbox checked={flipH} onChange={setFlipH} label="flip left to right (mirror)" />
      <Checkbox checked={flipV} onChange={setFlipV} label="flip upside down" />
      <Field label={`straighten: ${straighten}°`}>
        <input
          type="range"
          min={-10}
          max={10}
          step={0.5}
          value={straighten}
          onChange={(e) => setStraighten(Number(e.target.value))}
          className="w-full accent-black"
          aria-label="Straighten angle in degrees"
        />
      </Field>
      {canFlag && (
        <Checkbox
          checked={bake}
          onChange={setBake}
          label="bake it in (for players that ignore rotation)"
        />
      )}
      <p className="text-xs text-ink-3">
        {lossless
          ? "Instant, no quality loss: only the rotation flag changes."
          : "Re-encodes the video so every player shows it turned."}
      </p>
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
      disabled={(!video && "This file has no video.") || (!turn && !flipH && !flipV && !straighten && "Nothing to change yet.")}
      jobs={() => {
        const m = media!;
        if (lossless) {
          const total = ((video!.rotation + turn) % 360 + 360) % 360;
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
        <div
          style={{
            transform: `rotate(${turn + straighten}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
          }}
          className="transition-transform"
        >
          <Player media={media} player={player} onRemove={() => setMedia(null)} />
        </div>
      )}
    </EnginePage>
  );
}
