import { Plus, X } from "lucide-react";
import { useState } from "react";
import { EnginePage, Player, usePlayer, type EngineJob } from "../../components/EnginePage";
import { RangeFields } from "../../components/RangeFields";
import { Timeline } from "../../components/Timeline";
import { Button, Field, PanelSection, Segmented } from "../../components/ui";
import {
  ENCODE_MP4,
  invertSpans,
  mimeFor,
  safeBase,
  sameExtension,
  type Span,
} from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

type Keep = "keep" | "delete";
type Mode = "fast" | "exact";
type Output = "joined" | "separate";

export default function Trim() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [ranges, setRanges] = useState<Span[]>([]);
  const [active, setActive] = useState(0);
  const [keep, setKeep] = useState<Keep>("keep");
  const [mode, setMode] = useState<Mode>("fast");
  const [output, setOutput] = useState<Output>("joined");
  const player = usePlayer();

  const duration = media?.info.duration ?? 0;
  const parts = media
    ? (keep === "keep" ? [...ranges].sort((a, b) => a.start - b.start) : invertSpans(ranges, duration))
    : [];
  // Joining several parts losslessly needs a second pass; re-encoding does it in one.
  const exact = mode === "exact" || (output === "joined" && parts.length > 1);
  const kept = parts.reduce((s, p) => s + p.end - p.start, 0);

  const jobs = (): EngineJob[] => {
    const m = media!;
    const hasAudio = m.info.audio.length > 0;
    const ext = exact ? "mp4" : sameExtension(m);
    const mime = mimeFor(ext);
    if (output === "separate" || parts.length === 1) {
      const base = safeBase(m.file);
      return [
        {
          duration: kept,
          mime,
          name: parts.length === 1 ? outputName(m.file.name, "trimmed", ext) : undefined,
          args: ([input]) => [
            "-i",
            input!,
            ...parts.flatMap((p, i) => [
              "-ss",
              String(p.start),
              "-to",
              String(p.end),
              "-map",
              "0:v:0?",
              "-map",
              "0:a:0?",
              ...(exact ? ENCODE_MP4 : ["-c", "copy", "-avoid_negative_ts", "make_zero"]),
              `/out/${base}_part${String(i + 1).padStart(2, "0")}.${ext}`,
            ]),
          ],
        },
      ];
    }
    const graph = parts
      .map(
        (p, i) =>
          `[0:v]trim=${p.start}:${p.end},setpts=PTS-STARTPTS[v${i}]` +
          (hasAudio ? `;[0:a]atrim=${p.start}:${p.end},asetpts=PTS-STARTPTS[a${i}]` : ""),
      )
      .join(";");
    const inputs = parts.map((_, i) => `[v${i}]${hasAudio ? `[a${i}]` : ""}`).join("");
    const concat = `${inputs}concat=n=${parts.length}:v=1:a=${hasAudio ? 1 : 0}[v]${hasAudio ? "[a]" : ""}`;
    return [
      {
        duration: kept,
        mime,
        name: outputName(m.file.name, "trimmed", "mp4"),
        args: ([input]) => [
          "-i",
          input!,
          "-filter_complex",
          `${graph};${concat}`,
          "-map",
          "[v]",
          ...(hasAudio ? ["-map", "[a]"] : []),
          ...ENCODE_MP4,
          "/out/trimmed.mp4",
        ],
      },
    ];
  };

  const settings = media && (
    <>
      <PanelSection title="trim">
        <Segmented
          label="What to do with the parts"
          value={keep}
          onChange={setKeep}
          options={[
            { value: "keep", label: "keep selected" },
            { value: "delete", label: "delete selected" },
          ]}
        />
        <Field label="mode">
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "fast", label: "fast" },
              { value: "exact", label: "exact" },
            ]}
          />
        </Field>
        <p className="text-xs text-ink-3">
          {mode === "fast"
            ? "Instant, no quality loss. Cuts move to the nearest keyframe, so they can be off by a second or so."
            : "Cuts exactly where you chose. Re-encodes, so it takes longer."}
        </p>
        {parts.length > 1 && (
          <Field label="save as">
            <Segmented
              label="Save as"
              value={output}
              onChange={setOutput}
              options={[
                { value: "joined", label: "one file" },
                { value: "separate", label: "one file per part" },
              ]}
            />
          </Field>
        )}
        {mode === "fast" && output === "joined" && parts.length > 1 && (
          <p className="text-xs text-ink-3">Joining several parts re-encodes the video.</p>
        )}
      </PanelSection>
    </>
  );

  return (
    <EnginePage
      toolId="trim"
      subtitle="Pick the parts to keep (or cut out)"
      media={media ? [media] : []}
      onMedia={(files) => {
        const next = files[0];
        if (!next) return;
        setMedia(next);
        setRanges([{ start: 0, end: next.info.duration }]);
        setActive(0);
      }}
      settings={settings}
      action="trim"
      running="trimming…"
      disabled={!parts.length && "Nothing would be left. Pick a different part."}
      jobs={jobs}
    >
      {media && (
        <>
          <Player media={media} player={player} onRemove={() => setMedia(null)} />
          <Timeline
            duration={duration}
            time={player.time}
            onSeek={player.seek}
            ranges={ranges}
            onRanges={setRanges}
            active={active}
            onActive={setActive}
            fps={media.info.video[0]?.fps ?? 30}
          />
          <div className="space-y-2">
            {ranges.map((r, i) => (
              <div
                key={i}
                className={`flex flex-wrap items-end gap-2 rounded-md border-3 p-2 ${
                  i === active ? "border-ink" : "border-transparent"
                }`}
                onFocus={() => setActive(i)}
              >
                <RangeFields
                  start={r.start}
                  end={r.end}
                  duration={duration}
                  onChange={(next) => setRanges(ranges.map((x, k) => (k === i ? next : x)))}
                />
                {ranges.length > 1 && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove part ${i + 1}`}
                    onClick={() => {
                      setRanges(ranges.filter((_, k) => k !== i));
                      setActive(0);
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              onClick={() => {
                const t = player.time;
                const end = Math.min(duration, t + Math.max(1, duration / 10));
                setRanges([...ranges, { start: Math.max(0, end - Math.max(1, duration / 10)), end }]);
                setActive(ranges.length);
              }}
            >
              <Plus className="size-4" /> add a part
            </Button>
          </div>
        </>
      )}
    </EnginePage>
  );
}
