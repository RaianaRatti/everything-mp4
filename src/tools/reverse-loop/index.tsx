import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Field, PanelSection, Segmented, inputClass } from "../../components/ui";
import { ENCODE_MP4, mimeFor, sameExtension } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

type Mode = "reverse" | "boomerang" | "loop";

/** Reversing holds every frame in memory, so long videos may not fit. */
const LONG_REVERSE = 60;

export default function ReverseLoop() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [mode, setMode] = useState<Mode>("reverse");
  const [loopBy, setLoopBy] = useState<"times" | "length">("times");
  const [times, setTimes] = useState(3);
  const [length, setLength] = useState(60);
  const player = usePlayer();

  const info = media?.info;
  const duration = info?.duration ?? 0;
  const hasAudio = !!info?.audio.length;
  const outLength =
    mode === "reverse"
      ? duration
      : mode === "boomerang"
        ? duration * 2
        : loopBy === "times"
          ? duration * times
          : length;

  const jobs = () => {
    const m = media!;
    if (mode === "loop") {
      const ext = sameExtension(m);
      // Looping copies the same packets again: instant and lossless.
      return [
        {
          duration: outLength,
          mime: mimeFor(ext),
          name: outputName(m.file.name, "looped", ext),
          args: ([input]: string[]) => [
            "-stream_loop",
            loopBy === "times" ? String(times - 1) : "-1",
            "-i",
            input!,
            ...(loopBy === "length" ? ["-t", String(length)] : []),
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c",
            "copy",
            `/out/looped.${ext}`,
          ],
        },
      ];
    }
    const graph =
      mode === "reverse"
        ? `[0:v]reverse[v]${hasAudio ? ";[0:a]areverse[a]" : ""}`
        : `[0:v]split[f][b];[b]reverse[r]` +
          (hasAudio ? `;[0:a]asplit[fa][ba];[ba]areverse[ra];[f][fa][r][ra]concat=n=2:v=1:a=1[v][a]` : `;[f][r]concat=n=2:v=1:a=0[v]`);
    return [
      {
        duration: outLength,
        mime: "video/mp4",
        name: outputName(m.file.name, mode === "reverse" ? "reversed" : "boomerang", "mp4"),
        args: ([input]: string[]) => [
          "-i",
          input!,
          "-filter_complex",
          graph,
          "-map",
          "[v]",
          ...(hasAudio ? ["-map", "[a]"] : []),
          ...ENCODE_MP4,
          "/out/reversed.mp4",
        ],
      },
    ];
  };

  const settings = media && (
    <PanelSection title="reverse & loop">
      <Segmented
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "reverse", label: "reverse" },
          { value: "boomerang", label: "boomerang" },
          { value: "loop", label: "loop" },
        ]}
      />
      {mode === "loop" && (
        <>
          <Segmented
            label="Loop by"
            value={loopBy}
            onChange={setLoopBy}
            options={[
              { value: "times", label: "number of times" },
              { value: "length", label: "up to a length" },
            ]}
          />
          {loopBy === "times" ? (
            <Field label="times">
              <input
                type="number"
                min={2}
                max={100}
                value={times}
                onChange={(e) => Number(e.target.value) >= 2 && setTimes(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="length in seconds">
              <input
                type="number"
                min={1}
                value={length}
                onChange={(e) => Number(e.target.value) > 0 && setLength(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          )}
          <p className="text-xs text-ink-3">Instant, no quality loss.</p>
        </>
      )}
      {mode !== "loop" && duration > LONG_REVERSE && (
        <p className="text-xs text-ink-3">
          Reversing a long video needs a lot of memory and may fail. Trim it into shorter parts if
          it does.
        </p>
      )}
      <p className="text-sm">
        {formatTime(duration)} → {formatTime(outLength)}
      </p>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="reverse-loop"
      subtitle="Play a video backwards, make a boomerang, make it a loop"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action={mode}
      running={mode === "loop" ? "looping…" : "reversing…"}
      disabled={!info?.video.length && "This file has no video."}
      jobs={jobs}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
    </EnginePage>
  );
}
