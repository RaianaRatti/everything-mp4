import { useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { RangeFields } from "../../components/RangeFields";
import { Timeline } from "../../components/Timeline";
import { Checkbox, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import { ENCODE_MP4, atempoChain, type Span } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { formatTime } from "../../lib/time";

const SPEEDS = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4, 8];

type Sound = "keep" | "pitch" | "mute";
type Kind = "speed" | "timelapse";

export default function Speed() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [kind, setKind] = useState<Kind>("speed");
  const [factor, setFactor] = useState(2);
  const [sound, setSound] = useState<Sound>("keep");
  const [blend, setBlend] = useState(false);
  const [partOnly, setPartOnly] = useState(false);
  const [range, setRange] = useState<Span>({ start: 0, end: 0 });
  const [every, setEvery] = useState(10);
  const [lapseBy, setLapseBy] = useState<"every" | "length">("every");
  const [target, setTarget] = useState(30);
  const player = usePlayer();

  const info = media?.info;
  const duration = info?.duration ?? 0;
  const fps = info?.video[0]?.fps ?? 30;
  const f =
    kind === "speed" ? factor : lapseBy === "every" ? every : Math.max(1, duration / target);
  const muted = kind === "timelapse" || sound === "mute" || !info?.audio.length;
  const parts =
    kind === "speed" && partOnly
      ? [
          { start: 0, end: range.start, f: 1 },
          { start: range.start, end: range.end, f },
          { start: range.end, end: duration, f: 1 },
        ].filter((p) => p.end - p.start > 0.05)
      : [{ start: 0, end: duration, f }];
  const outLength = parts.reduce((s, p) => s + (p.end - p.start) / p.f, 0);

  const graph = () => {
    const n = parts.length;
    const sr = info?.audio[0]?.sampleRate ?? 48000;
    const v = parts.map(
      (p, i) =>
        `[s${i}]trim=${p.start}:${p.end},setpts=(PTS-STARTPTS)/${p.f}` +
        (blend && p.f < 1 ? `,minterpolate=fps=${fps}:mi_mode=blend` : `,fps=${fps}`) +
        `[v${i}]`,
    );
    const a = muted
      ? []
      : parts.map(
          (p, i) =>
            `[t${i}]atrim=${p.start}:${p.end},asetpts=PTS-STARTPTS` +
            (p.f === 1
              ? ""
              : sound === "pitch"
                ? `,asetrate=${Math.round(sr * p.f)},aresample=${sr}`
                : `,${atempoChain(p.f)}`) +
            `[a${i}]`,
        );
    const inputs = parts.map((_, i) => `[v${i}]${muted ? "" : `[a${i}]`}`).join("");
    return [
      `[0:v]split=${n}${parts.map((_, i) => `[s${i}]`).join("")}`,
      ...(muted ? [] : [`[0:a]asplit=${n}${parts.map((_, i) => `[t${i}]`).join("")}`]),
      ...v,
      ...a,
      `${inputs}concat=n=${n}:v=1:a=${muted ? 0 : 1}[v]${muted ? "" : "[a]"}`,
    ].join(";");
  };

  const settings = media && (
    <PanelSection title="speed">
      <Segmented
        label="Kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "speed", label: "speed" },
          { value: "timelapse", label: "timelapse" },
        ]}
      />
      {kind === "speed" ? (
        <>
          <Select
            label="Speed"
            value={String(factor)}
            onChange={(v) => setFactor(Number(v))}
            options={SPEEDS.map((s) => ({
              value: String(s),
              label: `${s}×${s < 1 ? " (slower)" : " (faster)"}`,
            }))}
          />
          {info?.audio.length ? (
            <Field label="sound">
              <Select
                label="Sound"
                value={sound}
                onChange={setSound}
                options={[
                  { value: "keep", label: "keep the voice natural" },
                  { value: "pitch", label: "change pitch (chipmunk / deep)" },
                  { value: "mute", label: "mute" },
                ]}
              />
            </Field>
          ) : null}
          {factor < 1 && (
            <Checkbox
              checked={blend}
              onChange={setBlend}
              label="smoother slow motion (blends frames, slower to make)"
            />
          )}
          <Checkbox checked={partOnly} onChange={setPartOnly} label="only change one part" />
        </>
      ) : (
        <>
          <Segmented
            label="Timelapse by"
            value={lapseBy}
            onChange={setLapseBy}
            options={[
              { value: "every", label: "keep every Nth frame" },
              { value: "length", label: "target length" },
            ]}
          />
          {lapseBy === "every" ? (
            <Field label="keep one frame in">
              <input
                type="number"
                min={2}
                value={every}
                onChange={(e) => Number(e.target.value) >= 2 && setEvery(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="length in seconds">
              <input
                type="number"
                min={1}
                value={target}
                onChange={(e) => Number(e.target.value) > 0 && setTarget(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          )}
          <p className="text-xs text-ink-3">Timelapses have no sound.</p>
        </>
      )}
      <p className="text-sm">
        {formatTime(duration)} → {formatTime(outLength)}
      </p>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="speed"
      subtitle="Speed up, or slow down"
      media={media ? [media] : []}
      onMedia={(files) => {
        const next = files[0];
        if (!next) return;
        setMedia(next);
        setRange({ start: 0, end: Math.min(next.info.duration, 5) });
      }}
      settings={settings}
      action="change speed"
      running="changing speed…"
      disabled={!info?.video.length && "This file has no video."}
      jobs={() => [
        {
          duration: outLength,
          mime: "video/mp4",
          name: outputName(media!.file.name, kind === "timelapse" ? "timelapse" : `${f}x`, "mp4"),
          args: ([input]) => [
            "-i",
            input!,
            "-filter_complex",
            graph(),
            "-map",
            "[v]",
            ...(muted ? [] : ["-map", "[a]"]),
            ...ENCODE_MP4,
            "/out/speed.mp4",
          ],
        },
      ]}
    >
      {media && (
        <>
          <Player media={media} player={player} onRemove={() => setMedia(null)} playbackRate={kind === "speed" && f <= 4 ? f : 1} />
          {kind === "speed" && partOnly && (
            <>
              <Timeline
                duration={duration}
                time={player.time}
                onSeek={player.seek}
                ranges={[range]}
                onRanges={(r) => r[0] && setRange(r[0])}
                fps={fps}
              />
              <RangeFields start={range.start} end={range.end} duration={duration} onChange={setRange} />
            </>
          )}
        </>
      )}
    </EnginePage>
  );
}
