import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Timeline } from "../../components/Timeline";
import { Button, Checkbox, Field, PanelSection, Segmented } from "../../components/ui";
import {
  ENCODE_MP4,
  invertSpans,
  metadataValues,
  piecesGraph,
  type Piece,
  type Span,
} from "../../lib/ffmpeg/edit";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

export default function RemoveSilence() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [threshold, setThreshold] = useState(-35);
  const [minLength, setMinLength] = useState(0.6);
  const [padding, setPadding] = useState(0.15);
  const [quiet, setQuiet] = useState<(Span & { on: boolean })[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [action, setAction] = useState<"cut" | "speed">("cut");
  const engineReady = useEngine((s) => s.status === "ready");
  const player = usePlayer();

  const info = media?.info;
  const duration = info?.duration ?? 0;
  const hasVideo = !!info?.video.length;
  const fps = info?.video[0]?.fps ?? 30;

  // Padding keeps a little of each quiet part, so words aren't clipped.
  const removed = (quiet ?? [])
    .filter((q) => q.on)
    .map((q) => ({ start: q.start + padding, end: q.end - padding }))
    .filter((q) => q.end - q.start > 0.05);
  const pieces: Piece[] =
    action === "cut"
      ? invertSpans(removed, duration).map((s) => ({ ...s, f: 1 }))
      : [
          ...invertSpans(removed, duration).map((s) => ({ ...s, f: 1 })),
          ...removed.map((s) => ({ ...s, f: 4 })),
        ].sort((a, b) => a.start - b.start);
  const outLength = pieces.reduce((s, p) => s + (p.end - p.start) / p.f, 0);

  const find = async () => {
    if (!media) return;
    setFinding(true);
    try {
      const { outputs } = await runFfmpeg({
        inputs: [media.file],
        duration,
        args: ([input]) => [
          "-i",
          input!,
          "-vn",
          "-af",
          `silencedetect=n=${threshold}dB:d=${minLength},ametadata=print:file=/out/silence.txt`,
          "-f",
          "null",
          "-",
        ],
      });
      const starts = metadataValues(outputs[0]?.data, "lavfi.silence_start");
      const ends = metadataValues(outputs[0]?.data, "lavfi.silence_end");
      setQuiet(
        starts.map((start, i) => ({ start: Math.max(0, start), end: ends[i] ?? duration, on: true })),
      );
    } finally {
      setFinding(false);
    }
  };

  const settings = media && (
    <PanelSection title="remove silence">
      <Field label={`quieter than ${threshold} dB`}>
        <input
          type="range"
          min={-60}
          max={-15}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-black"
          aria-label="Silence threshold in decibels"
        />
      </Field>
      <Field label={`for at least ${minLength.toFixed(1)} s`}>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.1}
          value={minLength}
          onChange={(e) => setMinLength(Number(e.target.value))}
          className="w-full accent-black"
          aria-label="Shortest silence in seconds"
        />
      </Field>
      <Field label={`keep ${padding.toFixed(2)} s around words`}>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.05}
          value={padding}
          onChange={(e) => setPadding(Number(e.target.value))}
          className="w-full accent-black"
          aria-label="Padding in seconds"
        />
      </Field>
      <Button disabled={!engineReady || finding} onClick={() => void find()}>
        {finding ? "listening…" : quiet ? "find again" : "find quiet parts"}
      </Button>
      <Segmented
        label="Quiet parts"
        value={action}
        onChange={setAction}
        options={[
          { value: "cut", label: "cut them" },
          { value: "speed", label: "speed them up" },
        ]}
      />
      {quiet && (
        <p className="text-sm">
          {formatTime(duration)} → {formatTime(outLength)} (saves {formatTime(duration - outLength)})
        </p>
      )}
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="remove-silence"
      subtitle="Find quiet parts of a recording, cut them out"
      accept={["video", "audio"]}
      media={media ? [media] : []}
      onMedia={(files) => {
        if (!files[0]) return;
        setMedia(files[0]);
        setQuiet(null);
      }}
      settings={settings}
      action={action === "cut" ? "cut quiet parts" : "speed up quiet parts"}
      running="removing silence…"
      disabled={
        (!info?.audio.length && "This file has no sound.") ||
        (!removed.length && "Find the quiet parts first.")
      }
      jobs={() => [
        {
          duration: outLength,
          mime: hasVideo ? "video/mp4" : "audio/mp4",
          name: outputName(media!.file.name, "no-silence", hasVideo ? "mp4" : "m4a"),
          args: ([input]) => [
            "-i",
            input!,
            "-filter_complex",
            piecesGraph(pieces, { video: hasVideo, audio: true, fps }),
            ...(hasVideo ? ["-map", "[v]"] : []),
            "-map",
            "[a]",
            ...(hasVideo ? ENCODE_MP4 : ["-c:a", "aac", "-b:a", "192k"]),
            `/out/out.${hasVideo ? "mp4" : "m4a"}`,
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
            ranges={(quiet ?? []).filter((q) => q.on)}
            fps={fps}
          />
          {quiet && (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {!quiet.length && <p className="text-sm">No quiet parts found. Try a higher level.</p>}
              {quiet.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox
                    checked={q.on}
                    onChange={(on) => setQuiet(quiet.map((x, k) => (k === i ? { ...x, on } : x)))}
                    label={`${formatTime(q.start)} – ${formatTime(q.end)}`}
                  />
                  <Button variant="ghost" onClick={() => player.seek(q.start)}>
                    play
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
