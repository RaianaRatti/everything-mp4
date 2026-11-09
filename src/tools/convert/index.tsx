import { useState } from "react";
import { EngineBadge, EnginePanel } from "../../components/EnginePanel";
import { ExportDialog, type JobFile } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { FilePreview, MediaFileList } from "../../components/MediaFiles";
import { ActionButton, PrivacyNote, ToolLayout } from "../../components/ToolLayout";
import {
  Advanced,
  Checkbox,
  Field,
  Hint,
  PanelSection,
  Segmented,
  Select,
} from "../../components/ui";
import type { QualityChoice } from "../../lib/engine/estimate";
import { AUDIO_CODECS, VIDEO_CODECS } from "../../lib/engine/formats";
import { mediaWarnings } from "../../lib/engine/inspect";
import { transcodeInBrowser } from "../../lib/engine/transcode";
import { convertArgs } from "../../lib/ffmpeg/convertArgs";
import { ENGINE_WARN_BYTES, runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import {
  useAbilities,
  useEngineWhenNeeded,
  useMediaLoader,
  type Abilities,
} from "../../lib/ffmpeg/hooks";
import { formatBytes, outputName, uniqueNames } from "../../lib/files";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { writeBytes, type OutputTarget } from "../../lib/output";
import {
  DEFAULTS,
  PRESETS,
  audioCodecsFor,
  availableFormats,
  findFormat,
  normalize,
  planFile,
  videoCodecsFor,
  type ConvertSettings,
  type FilePlan,
} from "./plan";

const QUALITIES: { value: QualityChoice; label: string }[] = [
  { value: "smaller", label: "smaller" },
  { value: "balanced", label: "balanced" },
  { value: "high", label: "high" },
];

const RESOLUTIONS = [
  { value: "same", label: "same as the original" },
  { value: "2160", label: "4K (2160p)" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

const FRAME_RATES = [
  { value: "same", label: "same as the original" },
  ...["24", "25", "30", "50", "60"].map((v) => ({ value: v, label: `${v} fps` })),
];

export default function Convert() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [settings, setSettings] = useState<ConvertSettings>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const abilities = useAbilities();
  const add = (items: Parameters<typeof toMediaFiles>[0]) => {
    const added = toMediaFiles(items);
    setFiles((prev) => [...prev, ...added]);
    setSelected((s) => s ?? added[0]?.id ?? null);
  };
  const loader = useMediaLoader(add);

  const s = abilities ? normalize(settings, abilities) : settings;
  const plans = abilities ? files.map((f) => planFile(f.info, s, abilities)) : [];
  const needsEngine = plans.some((p) => p.choice.engine === "engine");
  const engineStatus = useEngineWhenNeeded(needsEngine);
  const impossible = plans.find((p) => p.choice.engine === null);
  const current = files.find((f) => f.id === selected) ?? files[0];
  const currentPlan = current ? plans[files.indexOf(current)] : undefined;
  const total = plans.reduce((sum, p) => sum + p.bytes, 0);
  const update = (patch: Partial<ConvertSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const sidebar = files.length ? (
    <>
      {abilities && <Settings settings={s} abilities={abilities} onChange={update} />}
      {currentPlan && <EngineBadge choice={currentPlan.choice} />}
      {needsEngine && <EnginePanel reason="Converting to this format needs the video engine." />}
      <p className="text-sm text-ink-2">
        about {formatBytes(total)}
        {files.length > 1 ? ` for ${files.length} files` : ""}
        {current && files.length === 1 ? ` (now ${formatBytes(current.file.size)})` : ""}
      </p>
      {files.some((f) => f.file.size > ENGINE_WARN_BYTES) && needsEngine && (
        <p className="text-sm text-red-700">
          Files over 1.5 GB may be too big for the video engine's memory. If it fails, try a shorter
          part or another format.
        </p>
      )}
      <ActionButton
        disabled={!abilities || !!impossible || (needsEngine && engineStatus !== "ready")}
        onClick={() => setRunning(true)}
      >
        convert {files.length > 1 ? `${files.length} files` : ""} to {findFormat(s.format).label}
      </ActionButton>
      <PrivacyNote>
        Several files are converted one after another with the same settings.
      </PrivacyNote>
    </>
  ) : undefined;

  const drop = (
    <FileDrop
      accept={["video"]}
      multiple
      compact={files.length > 0}
      title={files.length ? "add more videos" : undefined}
      subtitle="Convert between MP4, MOV, WebM, MKV, AVI, WMV, FLV, MPG, 3GP, ProRes and more"
      load={loader.load}
      onLoad={add}
    />
  );

  return (
    <ToolLayout toolId="convert" sidebar={sidebar}>
      <FileActionsContext.Provider value={files.length ? drop : null}>
      {loader.waiting.length > 0 && (
        <EnginePanel
          reason={`This browser can't read ${loader.waiting.map((f) => f.name).join(", ")} by itself.`}
        />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs tracking-wide text-ink-3 uppercase">one-click presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter(
              (p) =>
                !abilities || availableFormats(abilities).some((f) => f.id === p.settings.format),
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ ...DEFAULTS, ...p.settings })}
                className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {p.label}
                <span className="block text-xs text-ink-3">{p.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {current && (
        <>
          <FilePreview
            file={current.file}
            info={current.info}
            number={files.indexOf(current) + 1}
            onRemove={() => setFiles((prev) => prev.filter((f) => f.id !== current.id))}
          />
          {mediaWarnings(current.info)
            .filter((w) => w.startsWith("This is really"))
            .map((w) => (
              <Hint key={w}>{w}</Hint>
            ))}
        </>
      )}
      <MediaFileList
        files={files}
        selected={current?.id ?? null}
        onSelect={setSelected}
        onRemove={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
        extra={(f) => {
          const plan = plans[files.indexOf(f)];
          return plan ? (
            <span className="shrink-0 text-xs text-ink-3">→ {formatBytes(plan.bytes)}</span>
          ) : null;
        }}
      />
      {impossible && <p className="text-sm text-red-700">{impossible.choice.reason}</p>}

      {!files.length && drop}

      {running && (
        <ExportDialog
          running="converting…"
          failed="couldn't convert"
          onClose={() => setRunning(false)}
          zipName="converted.zip"
          estimate={
            files.length === 1 && current && currentPlan
              ? {
                  bytes: currentPlan.bytes,
                  name: outputName(current.file.name, "converted", findFormat(s.format).ext),
                  mimeType: findFormat(s.format).mime,
                }
              : undefined
          }
          run={async ({ signal, progress, target }) => {
            const names = uniqueNames(
              files.map((f) => outputName(f.file.name, "converted", findFormat(s.format).ext)),
            );
            const out: JobFile[] = [];
            const warnings: string[] = [];
            const notes = new Set<string>();
            for (const [i, f] of files.entries()) {
              const plan = plans[i]!;
              const label = files.length > 1 ? `file ${i + 1} of ${files.length}, ` : "";
              const blob = await convertOne(
                f,
                plan,
                s,
                files.length === 1 ? target : { kind: "memory" },
                signal,
                (fraction) => progress((i + fraction) / files.length, `${label}${f.file.name}:`),
              ).then((r) => {
                warnings.push(...r.warnings);
                return r.blob;
              });
              notes.add(
                plan.choice.engine === "engine"
                  ? "Made with the video engine."
                  : plan.choice.copy
                    ? "Copied without re-encoding: no quality lost."
                    : "Made with this device's video encoder.",
              );
              out.push({ name: names[i]!, blob });
            }
            return { files: out, warnings, notes: [...notes] };
          }}
        />
      )}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}

function Settings({
  settings: s,
  abilities,
  onChange,
}: {
  settings: ConvertSettings;
  abilities: Abilities;
  onChange: (patch: Partial<ConvertSettings>) => void;
}) {
  const engineReady = useEngine((st) => st.status === "ready");
  const format = findFormat(s.format);
  const formats = availableFormats(abilities);
  const videoCodecs = videoCodecsFor(format, abilities);
  const audioCodecs = audioCodecsFor(format, abilities);

  return (
    <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
      <PanelSection title="convert to">
        <Select
          label="Format"
          value={s.format}
          onChange={(format) => onChange({ format })}
          options={formats.map((f) => ({
            value: f.id,
            label: `${f.label}: ${f.description}`,
            group: f.group,
          }))}
        />
        {!engineReady && !abilities.engine && (
          <p className="text-xs text-ink-3">
            Older and editing formats use the video engine, which is offered when needed.
          </p>
        )}
        {(format.id === "mpg" || format.id === "vob") && (
          <Checkbox
            checked={s.dvd}
            onChange={(dvd) => onChange({ dvd })}
            label="make it play on DVD players"
          />
        )}
        <Field label="quality">
          <Segmented
            label="Quality"
            value={s.quality}
            options={QUALITIES}
            onChange={(quality) => onChange({ quality })}
          />
        </Field>
        <Checkbox
          checked={s.removeAudio}
          onChange={(removeAudio) => onChange({ removeAudio })}
          label="remove the sound"
        />
      </PanelSection>
      <PanelSection>
        <Advanced>
          <Field label="video codec">
            <Select
              label="Video codec"
              value={s.videoCodec}
              onChange={(videoCodec) => onChange({ videoCodec })}
              options={videoCodecs.map((c) => ({
                value: c,
                label: `${VIDEO_CODECS[c].label}: ${VIDEO_CODECS[c].note}`,
              }))}
            />
          </Field>
          {!s.removeAudio && (
            <Field label="audio codec">
              <Select
                label="Audio codec"
                value={s.audioCodec}
                onChange={(audioCodec) => onChange({ audioCodec })}
                options={audioCodecs.map((c) => ({
                  value: c,
                  label: `${AUDIO_CODECS[c].label}: ${AUDIO_CODECS[c].note}`,
                }))}
              />
            </Field>
          )}
          {!s.dvd && (
            <>
              <Field label="resolution">
                <Select
                  label="Resolution"
                  value={s.resolution ? String(s.resolution) : "same"}
                  onChange={(v) => onChange({ resolution: v === "same" ? null : Number(v) })}
                  options={RESOLUTIONS}
                />
              </Field>
              <Field label="frame rate">
                <Select
                  label="Frame rate"
                  value={s.fps ? String(s.fps) : "same"}
                  onChange={(v) => onChange({ fps: v === "same" ? null : Number(v) })}
                  options={FRAME_RATES}
                />
              </Field>
            </>
          )}
        </Advanced>
      </PanelSection>
    </div>
  );
}

/** Converts one file with the engine its plan picked. */
async function convertOne(
  f: MediaFile,
  plan: FilePlan,
  s: ConvertSettings,
  target: OutputTarget,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; warnings: string[] }> {
  const format = findFormat(s.format);
  const hasVideo = f.info.video.length > 0;
  const hasAudio = !s.removeAudio && f.info.audio.length > 0;

  if (plan.choice.engine === "browser") {
    return transcodeInBrowser({
      file: f.file,
      container: format.container,
      mime: format.mime,
      video: hasVideo
        ? {
            codec: s.videoCodec,
            bitrate: plan.videoBitrate ?? undefined,
            size: plan.size ?? undefined,
            frameRate: plan.fps ?? undefined,
          }
        : null,
      audio: hasAudio ? { codec: s.audioCodec, bitrate: plan.audioBitrate ?? undefined } : null,
      target,
      signal,
      onProgress,
    });
  }

  const { outputs } = await runFfmpeg({
    inputs: [f.file],
    duration: f.info.duration,
    signal,
    onProgress,
    args: ([input]) =>
      convertArgs({
        input: input!,
        output: `/out/output.${format.ext}`,
        container: format.container,
        video: hasVideo
          ? {
              codec: s.videoCodec,
              copy: plan.copyVideo,
              bitrate: plan.videoBitrate ?? undefined,
              size: plan.dvd
                ? { width: f.info.video[0]!.width, height: f.info.video[0]!.height }
                : (plan.size ?? undefined),
              fps: plan.fps ?? f.info.video[0]?.fps ?? undefined,
              dvd: plan.dvd ?? undefined,
            }
          : null,
        audio: hasAudio
          ? {
              codec: s.audioCodec,
              copy: plan.copyAudio,
              bitrate: plan.audioBitrate ?? undefined,
              channels: Math.min(2, f.info.audio[0]?.channels ?? 2),
            }
          : null,
      }),
  });
  return { blob: await writeBytes(target, outputs[0]!.data, format.mime), warnings: [] };
}
