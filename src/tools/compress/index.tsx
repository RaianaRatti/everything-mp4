import { useState } from "react";
import { CompareSlider } from "../../components/CompareSlider";
import { EnginePanel } from "../../components/EnginePanel";
import { ExportDialog } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { FilePreview } from "../../components/MediaFiles";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import {
  Advanced,
  Checkbox,
  Field,
  PanelSection,
  Segmented,
  Select,
  inputClass,
} from "../../components/ui";
import { chooseEngine } from "../../lib/engine/choose";
import { sizeFor } from "../../lib/engine/estimate";
import { transcodeInBrowser } from "../../lib/engine/transcode";
import { convertArgs } from "../../lib/ffmpeg/convertArgs";
import { runFfmpeg } from "../../lib/ffmpeg/engine";
import { useAbilities, useEngineWhenNeeded, useMediaLoader } from "../../lib/ffmpeg/hooks";
import { formatBytes, outputName } from "../../lib/files";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { writeBytes, type OutputTarget } from "../../lib/output";
import { planCompression, retryBitrate, type CompressMode, type CompressPlan } from "./math";

const MB = 1024 ** 2;
const SIZE_PRESETS = [10, 25, 50, 100];

type ModeKind = CompressMode["kind"];

const MODES: { value: ModeKind; label: string }[] = [
  { value: "size", label: "target size" },
  { value: "quality", label: "quality" },
  { value: "percent", label: "% smaller" },
];

const MAX_SIZES = [
  { value: "keep", label: "keep the size" },
  { value: "1080", label: "at most 1080p" },
  { value: "720", label: "at most 720p" },
  { value: "480", label: "at most 480p" },
  { value: "360", label: "at most 360p" },
];

export default function Compress() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [kind, setKind] = useState<ModeKind>("size");
  const [megabytes, setMegabytes] = useState(25);
  const [level, setLevel] = useState(50);
  const [percent, setPercent] = useState(50);
  const [maxSide, setMaxSide] = useState<number | null>(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [running, setRunning] = useState(false);
  const abilities = useAbilities();
  const setFromItems = (items: Parameters<typeof toMediaFiles>[0]) =>
    setMedia(toMediaFiles(items)[0] ?? null);
  const loader = useMediaLoader(setFromItems);

  const info = media?.info;
  const video = info?.video[0];
  const mode: CompressMode =
    kind === "size"
      ? { kind, bytes: megabytes * MB }
      : kind === "quality"
        ? { kind, level }
        : { kind, percent };
  const plan =
    info && video
      ? planCompression(
          {
            duration: info.duration,
            size: { width: video.width, height: video.height },
            fps: video.fps ?? 30,
            bytes: info.size,
            hasAudio: info.audio.length > 0 && !removeAudio,
            videoBitrate: video.bitrate,
          },
          mode,
          maxSide,
        )
      : null;
  const choice =
    info && video && abilities
      ? chooseEngine({
          browserReads: info.readBy === "browser",
          container: "mp4",
          video: { from: video.codecId, canDecode: video.canDecode, to: "h264", changed: true },
          audio:
            info.audio[0] && !removeAudio
              ? {
                  from: info.audio[0].codecId,
                  canDecode: info.audio[0].canDecode,
                  to: "aac",
                  changed: true,
                }
              : null,
          browserEncodes: {
            video: !!abilities.browserVideo.h264,
            audio: !!abilities.browserAudio.aac,
          },
          engine: abilities.engine,
        })
      : null;
  const engineStatus = useEngineWhenNeeded(choice?.engine === "engine");
  const estimate = plan && info ? sizeFor(plan.videoBitrate + plan.audioBitrate, info.duration) : 0;
  const name = media ? outputName(media.file.name, "compressed", "mp4") : "";

  const sidebar =
    media && info && plan && choice ? (
      <>
        <div className="divide-y-3 divide-ink rounded-lg border-3 border-ink bg-card">
          <PanelSection title="compress by">
            <Segmented label="Compress by" value={kind} options={MODES} onChange={setKind} />
            {kind === "size" && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1">
                  {SIZE_PRESETS.map((mb) => (
                    <button
                      key={mb}
                      type="button"
                      aria-pressed={megabytes === mb}
                      disabled={mb * MB >= info.size}
                      onClick={() => setMegabytes(mb)}
                      className={`rounded-md border-3 border-ink px-1 py-1.5 text-sm disabled:border-ink-3 disabled:text-ink-3 ${
                        megabytes === mb ? "bg-accent" : "bg-card hover:bg-paper-2"
                      }`}
                    >
                      {mb} MB
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  or
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={megabytes}
                    onChange={(e) =>
                      Number(e.target.value) > 0 && setMegabytes(Number(e.target.value))
                    }
                    className={`${inputClass} w-24 py-1.5`}
                    aria-label="Target size in megabytes"
                  />
                  MB
                </label>
              </div>
            )}
            {kind === "quality" && (
              <div className="space-y-1">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                  aria-label="Quality"
                  className="w-full accent-black"
                />
                <div className="flex justify-between text-xs text-ink-3">
                  <span>smallest file</span>
                  <span>best picture</span>
                </div>
              </div>
            )}
            {kind === "percent" && (
              <div className="space-y-1">
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  aria-label="How much smaller, in percent"
                  className="w-full accent-black"
                />
                <p className="text-sm">{percent}% smaller</p>
              </div>
            )}
          </PanelSection>
          <PanelSection>
            <Advanced>
              <Field label="picture size">
                <Select
                  label="Picture size"
                  value={maxSide ? String(maxSide) : "keep"}
                  onChange={(v) => setMaxSide(v === "keep" ? null : Number(v))}
                  options={MAX_SIZES}
                />
              </Field>
              {info.audio.length > 0 && (
                <Checkbox
                  checked={removeAudio}
                  onChange={setRemoveAudio}
                  label="remove the sound"
                />
              )}
            </Advanced>
          </PanelSection>
        </div>
        {plan.impossible && <p className="text-sm text-red-700">{plan.impossible}</p>}
        {choice.engine === "engine" && (
          <EnginePanel reason="This video needs the video engine to compress." />
        )}
        <ActionButton
          disabled={
            !!plan.impossible ||
            !choice.engine ||
            (choice.engine === "engine" && engineStatus !== "ready")
          }
          onClick={() => setRunning(true)}
        >
          compress to MP4
        </ActionButton>
      </>
    ) : undefined;

  const drop = (
    <FileDrop
      accept={["video"]}
      compact={!!media}
      subtitle="Pick target size"
      load={loader.load}
      onLoad={setFromItems}
    />
  );

  return (
    <ToolLayout toolId="compress" sidebar={sidebar}>
      <FileActionsContext.Provider value={media ? drop : null}>
      {loader.waiting.length > 0 && (
        <EnginePanel reason={`This browser can't read ${loader.waiting[0]!.name} by itself.`} />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}
      {media && <FilePreview file={media.file} info={media.info} onRemove={() => setMedia(null)} />}
      {media && !video && (
        <p className="text-sm text-red-700">This file has no video to compress.</p>
      )}
      {!media && drop}

      {running && media && plan && choice && (
        <ExportDialog
          running="compressing…"
          failed="couldn't compress"
          onClose={() => setRunning(false)}
          estimate={{ bytes: estimate, name, mimeType: "video/mp4" }}
          renderResult={(result) => {
            const out = result.files[0];
            return out ? (
              <>
                <CompareSlider before={media.file} after={out.blob} />
                <p className="text-sm">
                  {formatBytes(media.file.size)} → {formatBytes(out.blob.size)} (
                  {Math.round((1 - out.blob.size / media.file.size) * 100)}% smaller)
                </p>
              </>
            ) : null;
          }}
          run={async ({ signal, progress, target }) => {
            let current: CompressPlan = plan;
            let blob: Blob | null = null;
            const notes: string[] = [];
            // Encoders don't hit a size exactly; if it comes out too big, try again a bit lower.
            for (let attempt = 0; attempt < 3; attempt++) {
              const label = attempt
                ? `trying again a little smaller (${attempt + 1} of 3)…`
                : "compressing…";
              blob = await compressOnce(
                media,
                current,
                choice.engine!,
                removeAudio,
                target,
                signal,
                (f) => progress(f, label),
              );
              const next = current.targetBytes
                ? retryBitrate(current.videoBitrate, current.targetBytes, blob.size)
                : null;
              if (!next || attempt === 2) break;
              notes.push(
                `The first try came out at ${formatBytes(blob.size)}, so it was made again a little smaller.`,
              );
              current = { ...current, videoBitrate: next };
            }
            const warnings =
              current.targetBytes && blob!.size > current.targetBytes * 1.03
                ? [`It came out at ${formatBytes(blob!.size)}, a bit over the target.`]
                : [];
            return { files: [{ name, blob: blob! }], notes, warnings };
          }}
        />
      )}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}

async function compressOnce(
  media: MediaFile,
  plan: CompressPlan,
  engine: "browser" | "engine",
  removeAudio: boolean,
  target: OutputTarget,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<Blob> {
  const hasAudio = media.info.audio.length > 0 && !removeAudio && plan.audioBitrate > 0;
  if (engine === "browser") {
    const { blob } = await transcodeInBrowser({
      file: media.file,
      container: "mp4",
      mime: "video/mp4",
      video: {
        codec: "h264",
        bitrate: plan.videoBitrate,
        size: plan.size,
        frameRate: plan.fps,
        forceTranscode: true,
      },
      audio: hasAudio ? { codec: "aac", bitrate: plan.audioBitrate, forceTranscode: true } : null,
      target,
      signal,
      onProgress,
    });
    return blob;
  }
  const { outputs } = await runFfmpeg({
    inputs: [media.file],
    duration: media.info.duration,
    signal,
    onProgress,
    args: ([input]) =>
      convertArgs({
        input: input!,
        output: "/out/compressed.mp4",
        container: "mp4",
        video: {
          codec: "h264",
          copy: false,
          bitrate: plan.videoBitrate,
          size: plan.size,
          fps: plan.fps,
        },
        audio: hasAudio
          ? { codec: "aac", copy: false, bitrate: plan.audioBitrate, channels: 2 }
          : null,
      }),
  });
  return writeBytes(target, outputs[0]!.data, "video/mp4");
}
