import { useState } from "react";
import { EnginePanel } from "../../components/EnginePanel";
import { ExportDialog } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { FilePreview } from "../../components/MediaFiles";
import { MediaPreview } from "../../components/MediaPreview";
import { RangeFields } from "../../components/RangeFields";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Advanced, Checkbox, Field, PanelSection, Segmented, Select } from "../../components/ui";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { useEngineSupport, useEngineWhenNeeded, useMediaLoader } from "../../lib/ffmpeg/hooks";
import { formatBytes, outputName } from "../../lib/files";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { useObjectUrl } from "../../lib/objectUrl";
import { writeBytes } from "../../lib/output";
import {
  GIF_DEFAULTS,
  estimateBytes,
  frameCount,
  gifArgs,
  outputHeight,
  type Dither,
  type GifSettings,
} from "./gif";

const WIDTHS = ["original", "800", "640", "480", "360", "240"];
const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const FPS = [5, 8, 10, 12, 15, 20, 25, 30];
const COLORS = [16, 32, 64, 128, 256];

const DITHERS: { value: Dither; label: string }[] = [
  { value: "sierra2_4a", label: "smooth (recommended)" },
  { value: "floyd_steinberg", label: "fine grain" },
  { value: "bayer", label: "pattern (smaller file)" },
  { value: "none", label: "none (flat colors, smallest)" },
];

/** Starts a clip at most this long, so a first GIF stays a sensible size. */
const DEFAULT_LENGTH = 5;

export default function VideoToGif() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [s, setS] = useState<GifSettings>({ ...GIF_DEFAULTS, start: 0, end: 0 });
  const [running, setRunning] = useState(false);
  const support = useEngineSupport();
  const engineStatus = useEngineWhenNeeded(!!media);
  const engineReady = useEngine((st) => st.status === "ready");

  const take = (items: Parameters<typeof toMediaFiles>[0]) => {
    const next = toMediaFiles(items)[0];
    if (!next) return;
    setMedia(next);
    setS((prev) => ({ ...prev, start: 0, end: Math.min(next.info.duration, DEFAULT_LENGTH) }));
  };
  const loader = useMediaLoader(take);
  const update = (patch: Partial<GifSettings>) => setS((prev) => ({ ...prev, ...patch }));

  const video = media?.info.video[0];
  const source = video ? { width: video.width, height: video.height } : { width: 0, height: 0 };
  const width = s.width && s.width < source.width ? s.width : null;
  const settings = { ...s, width };
  const bytes = video ? estimateBytes(settings, source) : 0;
  const frames = frameCount(settings);
  const webp = !support || support.encoders.has("libwebp_anim");
  const name = media ? outputName(media.file.name, "", settings.format) : "";

  const sidebar =
    media && video ? (
      <>
        <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
          <PanelSection title="gif">
            <Field label="width">
              <Select
                label="Width"
                value={width ? String(width) : "original"}
                onChange={(v) => update({ width: v === "original" ? null : Number(v) })}
                options={WIDTHS.filter((w) => w === "original" || Number(w) < source.width).map(
                  (w) => ({
                    value: w,
                    label: w === "original" ? `original (${source.width} px)` : `${w} px`,
                  }),
                )}
              />
            </Field>
            <Field label="frames per second">
              <Select
                label="Frames per second"
                value={String(s.fps)}
                onChange={(v) => update({ fps: Number(v) })}
                options={FPS.map((f) => ({
                  value: String(f),
                  label: `${f} fps${f === 12 ? " (smooth enough, small)" : ""}`,
                }))}
              />
            </Field>
            <Field label="speed">
              <Select
                label="Speed"
                value={String(s.speed)}
                onChange={(v) => update({ speed: Number(v) })}
                options={SPEEDS.map((x) => ({
                  value: String(x),
                  label: x === 1 ? "normal" : `${x}×`,
                }))}
              />
            </Field>
            <Field label="plays">
              <Segmented
                label="Plays"
                value={String(s.plays)}
                onChange={(v) => update({ plays: Number(v) })}
                options={[
                  { value: "0", label: "forever" },
                  { value: "1", label: "once" },
                  { value: "3", label: "3 times" },
                ]}
              />
            </Field>
            <Checkbox
              checked={s.boomerang}
              onChange={(boomerang) => update({ boomerang })}
              label="boomerang (forward, then backward)"
            />
          </PanelSection>
          <PanelSection>
            <Advanced>
              {webp && (
                <Field label="format">
                  <Segmented
                    label="Format"
                    value={s.format}
                    onChange={(format) => update({ format })}
                    options={[
                      { value: "gif", label: "GIF" },
                      { value: "webp", label: "animated WebP" },
                    ]}
                  />
                </Field>
              )}
              {s.format === "gif" && (
                <>
                  <Field label="colors">
                    <Select
                      label="Colors"
                      value={String(s.colors)}
                      onChange={(v) => update({ colors: Number(v) })}
                      options={COLORS.map((c) => ({
                        value: String(c),
                        label: `${c}${c === 256 ? " (most)" : ""}`,
                      }))}
                    />
                  </Field>
                  <Field label="dithering">
                    <Select
                      label="Dithering"
                      value={s.dither}
                      onChange={(dither) => update({ dither })}
                      options={DITHERS}
                    />
                  </Field>
                </>
              )}
              {s.format === "webp" && (
                <p className="text-xs text-ink-3">
                  WebP is much smaller than GIF and works in all current browsers, but not in every
                  app.
                </p>
              )}
            </Advanced>
          </PanelSection>
        </div>
        <p className="text-sm text-ink-2">
          {width ?? source.width}×{outputHeight(source, width)} · {frames} frames · roughly{" "}
          {formatBytes(bytes)}
        </p>
        {bytes > 20 * 1024 ** 2 && (
          <p className="text-sm text-ink-2">
            That's big for a GIF. A shorter part, a smaller width or fewer frames per second will
            shrink it.
          </p>
        )}
        {!engineReady && <EnginePanel reason="Making GIFs uses the video engine." />}
        <ActionButton disabled={engineStatus !== "ready"} onClick={() => setRunning(true)}>
          make {s.format === "webp" ? "WebP" : "GIF"}
        </ActionButton>
      </>
    ) : undefined;

  const drop = (
    <FileDrop
      accept={["video"]}
      compact={!!media}
      subtitle="Pick a part, then choose the size, speed and colors"
      load={loader.load}
      onLoad={take}
    />
  );

  return (
    <ToolLayout toolId="video-to-gif" sidebar={sidebar}>
      <FileActionsContext.Provider value={media ? drop : null}>
      {loader.waiting.length > 0 && (
        <EnginePanel reason={`This browser can't read ${loader.waiting[0]!.name} by itself.`} />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}
      {media && video && (
        <>
          <SourcePreview
            media={media}
            range={{ start: s.start, end: s.end }}
            speed={s.speed}
            onRemove={() => setMedia(null)}
          />
          <div className="space-y-2">
            <p className="text-xs tracking-wide text-ink-3 uppercase">part to use</p>
            <RangeFields
              start={s.start}
              end={s.end}
              duration={media.info.duration}
              onChange={update}
            />
          </div>
        </>
      )}
      {media && !video && <p className="text-sm text-red-700">This file has no video.</p>}
      {!media && drop}

      {running && media && (
        <ExportDialog
          running={`making the ${s.format === "webp" ? "WebP" : "GIF"}…`}
          failed="couldn't make it"
          onClose={() => setRunning(false)}
          run={async ({ signal, progress, target }) => {
            const { outputs } = await runFfmpeg({
              inputs: [media.file],
              // Progress is measured in output time, which speed changes.
              duration:
                ((settings.end - settings.start) / settings.speed) * (settings.boomerang ? 2 : 1),
              signal,
              onProgress: (f) => progress(f, `rendering ${frames} frames…`),
              args: ([input]) => gifArgs(input!, `/out/${name}`, settings),
            });
            const mime = settings.format === "webp" ? "image/webp" : "image/gif";
            const blob = await writeBytes(target, outputs[0]!.data, mime);
            return { files: [{ name, blob }] };
          }}
        />
      )}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}

/** The source, looping over the chosen part at the chosen speed, as a live preview. */
function SourcePreview({
  media,
  range,
  speed,
  onRemove,
}: {
  media: MediaFile;
  range: { start: number; end: number };
  speed: number;
  onRemove: () => void;
}) {
  const url = useObjectUrl(media.file);
  if (!media.info.canPlay || !url)
    return <FilePreview file={media.file} info={media.info} onRemove={onRemove} />;
  return <MediaPreview src={url} range={range} playbackRate={speed} muted />;
}
