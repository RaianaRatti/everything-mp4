import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { EnginePage, type EngineJob } from "../../components/EnginePage";
import { RangeFields } from "../../components/RangeFields";
import { Button, Field, PanelSection, Select, inputClass } from "../../components/ui";
import { ENCODE_MP4, even, fitGraph, mimeFor, sameExtension, type FitMode } from "../../lib/ffmpeg/edit";
import { extension, outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

interface Clip {
  media: MediaFile;
  start: number;
  end: number;
  /** Percent. */
  volume: number;
}

type SizeChoice = "first" | "largest" | "1920x1080" | "1280x720" | "1080x1920" | "1080x1080";
type Transition = "none" | "fade" | "fadeblack" | "wipeleft" | "slideleft";

const FPS = 30;

export default function Join() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [sizeChoice, setSizeChoice] = useState<SizeChoice>("first");
  const [fit, setFit] = useState<FitMode>("bars");
  const [transition, setTransition] = useState<Transition>("none");
  const [fade, setFade] = useState(1);

  const videos = clips.map((c) => c.media.info.video[0]);
  const size = (() => {
    if (sizeChoice === "first" || sizeChoice === "largest") {
      const pick =
        sizeChoice === "first"
          ? videos[0]
          : [...videos].sort((a, b) => (b?.width ?? 0) * (b?.height ?? 0) - (a?.width ?? 0) * (a?.height ?? 0))[0];
      return { width: even(pick?.width ?? 1280), height: even(pick?.height ?? 720) };
    }
    const [w, h] = sizeChoice.split("x").map(Number) as [number, number];
    return { width: w, height: h };
  })();

  const lengths = clips.map((c) => c.end - c.start);
  const d = transition === "none" ? 0 : Math.min(fade, ...lengths.map((l) => l / 2));
  const total = lengths.reduce((a, b) => a + b, 0) - d * Math.max(0, clips.length - 1);

  // Lossless needs every clip to be the same kind of video, untouched.
  const first = clips[0]?.media.info;
  const why = !first
    ? null
    : clips.some((c) => c.start > 0.01 || c.end < c.media.info.duration - 0.01)
      ? "Clips are trimmed, so the video is re-encoded."
      : clips.some((c) => c.volume !== 100)
        ? "A clip's volume changed, so the video is re-encoded."
        : transition !== "none"
          ? "Transitions need the video re-encoded."
          : clips.some((c) => {
                const v = c.media.info.video[0];
                const a = c.media.info.audio[0];
                const v0 = first.video[0];
                const a0 = first.audio[0];
                return (
                  c.media.info.format.id !== first.format.id ||
                  v?.codecId !== v0?.codecId ||
                  v?.width !== v0?.width ||
                  v?.height !== v0?.height ||
                  a?.codecId !== a0?.codecId ||
                  a?.sampleRate !== a0?.sampleRate
                );
              })
            ? "The clips have different formats or sizes, so the video is re-encoded."
            : null;
  const lossless = clips.length > 1 && why === null;

  const jobs = (): EngineJob[] => {
    if (lossless) {
      const ext = sameExtension(clips[0]!.media);
      // The engine names inputs 0.<ext>, 1.<ext>… in the same folder as this list.
      const list = clips
        .map((c, i) => `file '${i}.${extension(c.media.file.name) || "bin"}'`)
        .join("\n");
      return [
        {
          duration: total,
          mime: mimeFor(ext),
          name: outputName(clips[0]!.media.file.name, "joined", ext),
          extraInputs: [new File([list], "list.txt")],
          args: (inputs) => [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            inputs[inputs.length - 1]!,
            "-c",
            "copy",
            `/out/joined.${ext}`,
          ],
        },
      ];
    }
    const parts: string[] = [];
    clips.forEach((c, i) => {
      parts.push(
        `[${i}:v]trim=${c.start}:${c.end},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,settb=AVTB[p${i}]`,
        fitGraph(`p${i}`, `v${i}`, size.width, size.height, fit),
        c.media.info.audio.length
          ? `[${i}:a]atrim=${c.start}:${c.end},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.volume / 100}[a${i}]`
          : `anullsrc=r=48000:cl=stereo,atrim=0:${lengths[i]}[a${i}]`,
      );
    });
    if (d === 0) {
      parts.push(
        `${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`,
      );
    } else {
      let v = "v0";
      let a = "a0";
      let offset = 0;
      for (let i = 1; i < clips.length; i++) {
        offset += lengths[i - 1]! - d;
        const nv = i === clips.length - 1 ? "v" : `xv${i}`;
        const na = i === clips.length - 1 ? "a" : `xa${i}`;
        parts.push(
          `[${v}][v${i}]xfade=transition=${transition}:duration=${d}:offset=${offset.toFixed(3)}[${nv}]`,
          `[${a}][a${i}]acrossfade=d=${d}[${na}]`,
        );
        v = nv;
        a = na;
      }
    }
    return [
      {
        duration: total,
        mime: "video/mp4",
        name: outputName(clips[0]!.media.file.name, "joined", "mp4"),
        args: (inputs) => [
          ...inputs.flatMap((input) => ["-i", input]),
          "-filter_complex",
          parts.join(";"),
          "-map",
          "[v]",
          "-map",
          "[a]",
          ...ENCODE_MP4,
          "/out/joined.mp4",
        ],
      },
    ];
  };

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= clips.length) return;
    const next = [...clips];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setClips(next);
  };

  const settings = clips.length > 0 && (
    <PanelSection title="join">
      <Field label="output size">
        <Select
          label="Output size"
          value={sizeChoice}
          onChange={setSizeChoice}
          options={[
            { value: "first", label: "same as the first clip" },
            { value: "largest", label: "same as the largest clip" },
            { value: "1920x1080", label: "1080p wide" },
            { value: "1280x720", label: "720p wide" },
            { value: "1080x1920", label: "1080p tall" },
            { value: "1080x1080", label: "square" },
          ]}
        />
      </Field>
      <Field label="clips that don't fit">
        <Select
          label="Fit"
          value={fit}
          onChange={setFit}
          options={[
            { value: "bars", label: "black bars" },
            { value: "blur", label: "blurred background" },
            { value: "crop", label: "fill (crop the edges)" },
          ]}
        />
      </Field>
      <Field label="transition">
        <Select
          label="Transition"
          value={transition}
          onChange={setTransition}
          options={[
            { value: "none", label: "none" },
            { value: "fade", label: "crossfade" },
            { value: "fadeblack", label: "fade through black" },
            { value: "wipeleft", label: "wipe" },
            { value: "slideleft", label: "slide" },
          ]}
        />
      </Field>
      {transition !== "none" && (
        <Field label={`transition length: ${fade} s`}>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={fade}
            onChange={(e) => setFade(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Transition length in seconds"
          />
        </Field>
      )}
      <p className="text-xs text-ink-3">
        {lossless ? "Instant, no quality loss: the clips are the same format." : why}
      </p>
      <p className="text-sm">total {formatTime(total)}</p>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="join"
      subtitle="Combine videos"
      media={clips.map((c) => c.media)}
      multiple
      onMedia={(files) =>
        setClips((prev) => [
          ...prev,
          ...files
            .filter((m) => m.info.video.length)
            .map((media) => ({ media, start: 0, end: media.info.duration, volume: 100 })),
        ])
      }
      settings={settings}
      action="join"
      running="joining…"
      disabled={clips.length < 2 && "Add at least two videos."}
      jobs={jobs}
    >
      {clips.length > 0 && (
        <ol className="space-y-2">
          {clips.map((c, i) => (
            <li key={c.media.id} className="space-y-2 rounded-lg border-2 border-ink bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{c.media.file.name}</p>
                </div>
                <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Move down"
                  disabled={i === clips.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => setClips(clips.filter((_, k) => k !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <RangeFields
                  start={c.start}
                  end={c.end}
                  duration={c.media.info.duration}
                  onChange={(r) => setClips(clips.map((x, k) => (k === i ? { ...x, ...r } : x)))}
                />
                {c.media.info.audio.length > 0 && (
                  <label className="block space-y-1">
                    <span className="text-xs text-ink-2">volume %</span>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      step={10}
                      value={c.volume}
                      onChange={(e) =>
                        setClips(
                          clips.map((x, k) => (k === i ? { ...x, volume: Number(e.target.value) } : x)),
                        )
                      }
                      className={`${inputClass} w-24`}
                    />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </EnginePage>
  );
}
