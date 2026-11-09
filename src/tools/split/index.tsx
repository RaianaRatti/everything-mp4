import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Timeline } from "../../components/Timeline";
import { Button, Checkbox, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import {
  ENCODE_MP4,
  detectScenes,
  mimeFor,
  safeBase,
  sameExtension,
} from "../../lib/ffmpeg/edit";
import { useEngine } from "../../lib/ffmpeg/engine";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

type By = "time" | "parts" | "size" | "markers" | "scenes";

const BY: { value: By; label: string }[] = [
  { value: "time", label: "every N seconds" },
  { value: "parts", label: "into equal parts" },
  { value: "size", label: "by file size" },
  { value: "markers", label: "at markers" },
  { value: "scenes", label: "at scene changes" },
];

export default function Split() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [by, setBy] = useState<By>("time");
  const [seconds, setSeconds] = useState(60);
  const [count, setCount] = useState(2);
  const [megabytes, setMegabytes] = useState(25);
  const [markers, setMarkers] = useState<number[]>([]);
  const [scenes, setScenes] = useState<{ time: number; on: boolean }[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [exact, setExact] = useState(false);
  const engineReady = useEngine((s) => s.status === "ready");
  const player = usePlayer();

  const duration = media?.info.duration ?? 0;
  const bytesPerSecond = media ? media.file.size / Math.max(duration, 0.1) : 1;
  const step =
    by === "time"
      ? seconds
      : by === "parts"
        ? duration / count
        : by === "size"
          ? // Leave room: bitrate varies, and copies cut at keyframes.
            ((megabytes * 1024 ** 2) / bytesPerSecond) * 0.9
          : 0;
  const cuts = (
    by === "markers"
      ? markers
      : by === "scenes"
        ? (scenes ?? []).filter((s) => s.on).map((s) => s.time)
        : Array.from({ length: Math.max(0, Math.ceil(duration / Math.max(step, 0.5)) - 1) }, (_, i) =>
            (i + 1) * step,
          )
  ).filter((t) => t > 0.1 && t < duration - 0.1);

  const findScenes = async () => {
    if (!media) return;
    setFinding(true);
    try {
      const times = await detectScenes(media.file, 0.3, duration, new AbortController().signal, () => {});
      setScenes(times.map((time) => ({ time, on: true })));
    } finally {
      setFinding(false);
    }
  };

  const settings = media && (
    <PanelSection title="split">
      <Select label="Split" value={by} onChange={setBy} options={BY} />
      {by === "time" && (
        <Field label="seconds per part">
          <input
            type="number"
            min={1}
            value={seconds}
            onChange={(e) => Number(e.target.value) > 0 && setSeconds(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      )}
      {by === "parts" && (
        <Field label="number of parts">
          <input
            type="number"
            min={2}
            max={100}
            value={count}
            onChange={(e) => Number(e.target.value) >= 2 && setCount(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      )}
      {by === "size" && (
        <Field label="most MB per part">
          <input
            type="number"
            min={1}
            value={megabytes}
            onChange={(e) => Number(e.target.value) > 0 && setMegabytes(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      )}
      {by === "markers" && (
        <p className="text-xs text-ink-3">
          Press M on the timeline (or the button below the player) to add a marker where you want a
          cut.
        </p>
      )}
      {by === "scenes" && (
        <Button disabled={!engineReady || finding} onClick={() => void findScenes()}>
          {finding ? "finding scene changes…" : scenes ? "find again" : "find scene changes"}
        </Button>
      )}
      <Field label="mode">
        <Segmented
          label="Mode"
          value={exact ? "exact" : "fast"}
          onChange={(v) => setExact(v === "exact")}
          options={[
            { value: "fast", label: "fast" },
            { value: "exact", label: "exact" },
          ]}
        />
      </Field>
      <p className="text-xs text-ink-3">
        {exact
          ? "Cuts exactly at each point. Re-encodes, so it takes longer."
          : "Instant, no quality loss. Each cut moves to the nearest keyframe."}
      </p>
      <p className="text-sm">{cuts.length + 1} parts</p>
    </PanelSection>
  );

  const ext = media ? (exact ? "mp4" : sameExtension(media)) : "mp4";

  return (
    <EnginePage
      toolId="split"
      subtitle="Cut and download one video in parts"
      media={media ? [media] : []}
      onMedia={(files) => {
        if (!files[0]) return;
        setMedia(files[0]);
        setMarkers([]);
        setScenes(null);
      }}
      settings={settings}
      action="split"
      running="splitting…"
      disabled={!cuts.length && "Nothing to split at yet."}
      jobs={() => [
        {
          duration,
          mime: mimeFor(ext),
          args: ([input]) => [
            "-i",
            input!,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            ...(exact
              ? [...ENCODE_MP4, "-force_key_frames", cuts.join(",")]
              : ["-c", "copy"]),
            "-f",
            "segment",
            "-segment_times",
            cuts.map((c) => c.toFixed(3)).join(","),
            "-segment_start_number",
            "1",
            "-reset_timestamps",
            "1",
            `/out/${safeBase(media!.file)}_part%02d.${ext}`,
          ],
        },
      ]}
    >
      {media && (
        <>
          <Player media={media} player={player} onRemove={() => setMedia(null)} />
          <Timeline
            duration={duration}
            time={player.time}
            onSeek={player.seek}
            markers={cuts}
            onMarkers={by === "markers" ? setMarkers : undefined}
            fps={media.info.video[0]?.fps ?? 30}
          />
          {by === "markers" && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setMarkers([...markers, player.time].sort((a, b) => a - b))}
              >
                add marker at {formatTime(player.time)}
              </Button>
              {markers.length > 0 && (
                <Button variant="ghost" onClick={() => setMarkers([])}>
                  clear markers
                </Button>
              )}
            </div>
          )}
          {by === "scenes" && scenes && (
            <div className="space-y-1">
              {!scenes.length && <p className="text-sm">No scene changes found.</p>}
              {scenes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox
                    checked={s.on}
                    onChange={(on) =>
                      setScenes(scenes.map((x, k) => (k === i ? { ...x, on } : x)))
                    }
                    label={`cut at ${formatTime(s.time)}`}
                  />
                  <Button variant="ghost" onClick={() => player.seek(s.time)}>
                    show
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </EnginePage>
  );
}
