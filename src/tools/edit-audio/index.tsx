import { useState } from "react";
import { EnginePage, Player, usePlayer, type EngineJob } from "../../components/EnginePage";
import { FilePickerButton } from "../../components/FileDrop";
import { Checkbox, Field, PanelSection, Select, inputClass } from "../../components/ui";
import { audioCodecFor, mimeFor, sameExtension } from "../../lib/ffmpeg/edit";
import { acceptFor, outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

type Mode = "volume" | "mute" | "replace" | "music" | "sync";

const MODES: { value: Mode; label: string }[] = [
  { value: "volume", label: "volume and fades" },
  { value: "mute", label: "mute" },
  { value: "replace", label: "replace the sound" },
  { value: "music", label: "add background music" },
  { value: "sync", label: "fix audio sync" },
];

export default function EditAudio() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [mode, setMode] = useState<Mode>("volume");
  const [volume, setVolume] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [other, setOther] = useState<File | null>(null);
  const [offset, setOffset] = useState(0);
  const [loop, setLoop] = useState(true);
  const [level, setLevel] = useState(25);
  const [duck, setDuck] = useState(true);
  const [shift, setShift] = useState(0);
  const [track, setTrack] = useState("0");
  const player = usePlayer();

  const info = media?.info;
  const duration = info?.duration ?? 0;
  const tracks = info?.audio ?? [];
  const ext = media ? sameExtension(media) : "mp4";
  const needsOther = mode === "replace" || mode === "music";

  /** The chosen sound of the video, or all its tracks mixed. */
  const source = () =>
    track === "mix" && tracks.length > 1
      ? `${tracks.map((_, i) => `[0:a:${i}]`).join("")}amix=inputs=${tracks.length}:normalize=0`
      : `[0:a:${track}]anull`;

  const fades = (len: number) =>
    [
      fadeIn > 0 ? `afade=in:d=${fadeIn}` : "",
      fadeOut > 0 ? `afade=out:st=${Math.max(0, len - fadeOut).toFixed(3)}:d=${fadeOut}` : "",
    ]
      .filter(Boolean)
      .join(",");

  const jobs = (): EngineJob[] => {
    const m = media!;
    const name = outputName(m.file.name, mode === "mute" ? "muted" : "audio", ext);
    const base = { duration, mime: mimeFor(ext), name };
    // The video is copied as it is: only the sound changes.
    const out = (graph: string | null, extra: string[] = []) => (inputs: string[]) => [
      ...extra,
      "-i",
      inputs[0]!,
      ...inputs.slice(1).flatMap((input) => [
        ...(loop && mode !== "sync" ? ["-stream_loop", "-1"] : []),
        "-i",
        input,
      ]),
      ...(graph ? ["-filter_complex", graph] : []),
      "-map",
      "0:v:0",
      ...(graph ? ["-map", "[a]"] : []),
      "-c:v",
      "copy",
      ...(graph ? audioCodecFor(ext) : ["-an"]),
      "-t",
      String(duration),
      `/out/out.${ext}`,
    ];
    if (mode === "mute") return [{ ...base, args: out(null) }];
    if (mode === "volume") {
      const f = fades(duration);
      return [{ ...base, args: out(`${source()},volume=${volume / 100}${f ? `,${f}` : ""}[a]`) }];
    }
    if (mode === "sync") {
      // Later: pad the start with silence. Earlier: drop the first part of the sound.
      const g =
        shift >= 0
          ? `${source()},adelay=${Math.round(shift * 1000)}:all=1[a]`
          : `${source()},atrim=start=${-shift},asetpts=PTS-STARTPTS[a]`;
      return [{ ...base, args: out(g) }];
    }
    const delay = offset > 0 ? `,adelay=${Math.round(offset * 1000)}:all=1` : "";
    const f = fades(duration);
    const music = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS${delay},volume=${
      mode === "music" ? level / 100 : volume / 100
    }${f ? `,${f}` : ""},aformat=sample_rates=48000:channel_layouts=stereo`;
    if (mode === "replace") return [{ ...base, extraInputs: [other!], args: out(`${music}[a]`) }];
    const voice = `${source()},aformat=sample_rates=48000:channel_layouts=stereo`;
    const g = duck
      ? // Lower the music whenever the video's own sound is loud (someone talking).
        `${voice},asplit[v1][v2];${music}[m];[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=50:release=600[md];[v1][md]amix=inputs=2:duration=first:normalize=0[a]`
      : `${voice}[v1];${music}[m];[v1][m]amix=inputs=2:duration=first:normalize=0[a]`;
    return [{ ...base, extraInputs: [other!], args: out(g) }];
  };

  const settings = media && (
    <PanelSection title="edit audio">
      <Select label="What to do" value={mode} onChange={setMode} options={MODES} />
      {tracks.length > 1 && mode !== "mute" && mode !== "replace" && (
        <Field label="sound track">
          <Select
            label="Sound track"
            value={track}
            onChange={setTrack}
            options={[
              ...tracks.map((t, i) => ({
                value: String(i),
                label: `track ${t.number}${t.language ? ` (${t.language})` : ""}`,
              })),
              { value: "mix", label: "mix all tracks" },
            ]}
          />
        </Field>
      )}
      {needsOther && (
        <div className="space-y-1">
          <FilePickerButton
            accept={acceptFor(["audio", "video"])}
            onFiles={(files) => files[0] && setOther(files[0])}
            className="w-full"
          >
            {other ? `change ${mode === "music" ? "music" : "sound"}` : `pick ${mode === "music" ? "music" : "a sound file"}`}
          </FilePickerButton>
          {other && <p className="truncate text-xs text-ink-3">{other.name}</p>}
        </div>
      )}
      {(mode === "volume" || mode === "replace") && (
        <Field label={`volume: ${volume}%`}>
          <input
            type="range"
            min={0}
            max={300}
            step={5}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Volume in percent"
          />
        </Field>
      )}
      {mode === "music" && (
        <>
          <Field label={`music level: ${level}%`}>
            <input
              type="range"
              min={0}
              max={150}
              step={5}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full accent-black"
              aria-label="Music level in percent"
            />
          </Field>
          <Checkbox
            checked={duck}
            onChange={setDuck}
            label="lower the music while someone talks"
          />
        </>
      )}
      {needsOther && (
        <>
          <Field label="start the sound at (seconds)">
            <input
              type="number"
              min={0}
              step={0.1}
              value={offset}
              onChange={(e) => setOffset(Math.max(0, Number(e.target.value)))}
              className={inputClass}
            />
          </Field>
          <Checkbox checked={loop} onChange={setLoop} label="loop it if it's shorter than the video" />
        </>
      )}
      {(mode === "volume" || needsOther) && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="fade in (s)">
            <input
              type="number"
              min={0}
              step={0.5}
              value={fadeIn}
              onChange={(e) => setFadeIn(Math.max(0, Number(e.target.value)))}
              className={inputClass}
            />
          </Field>
          <Field label="fade out (s)">
            <input
              type="number"
              min={0}
              step={0.5}
              value={fadeOut}
              onChange={(e) => setFadeOut(Math.max(0, Number(e.target.value)))}
              className={inputClass}
            />
          </Field>
        </div>
      )}
      {mode === "sync" && (
        <Field label={`move the sound ${shift >= 0 ? "later" : "earlier"} by ${Math.abs(shift).toFixed(2)} s`}>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.02}
            value={shift}
            onChange={(e) => setShift(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Audio shift in seconds"
          />
        </Field>
      )}
      <p className="text-xs text-ink-3">The video is copied as it is: quick, no quality loss.</p>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="edit-audio"
      subtitle="Mute, change volume, replace sound, add music, fix sync"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action={mode === "mute" ? "mute" : "save"}
      running="working on the sound…"
      disabled={
        (!info?.video.length && "This file has no video.") ||
        (needsOther && !other && "Pick a sound file first.") ||
        (!needsOther && mode !== "mute" && !tracks.length && "This video has no sound.")
      }
      jobs={jobs}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
    </EnginePage>
  );
}
