import { Camera, Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { OpenIn } from "../../components/OpenIn";
import { ExportDialog } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { MediaPreview } from "../../components/MediaPreview";
import { RangeFields } from "../../components/RangeFields";
import { ActionButton, PrivacyNote, ToolLayout } from "../../components/ToolLayout";
import {
  Button,
  Field,
  PanelSection,
  Segmented,
  Select,
  inputClass,
} from "../../components/ui";
import { inspectMedia } from "../../lib/engine/inspect";
import { FriendlyError, friendlyMessage } from "../../lib/errors";
import { baseName, downloadBlob } from "../../lib/files";
import { IMAGE_EXT, grabFrame, type ImageType } from "../../lib/gfx/canvas";
import { isTyping } from "../../lib/keys";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { useObjectUrl } from "../../lib/objectUrl";
import { formatTime } from "../../lib/time";
import {
  MAX_FRAMES,
  contactSheet,
  extractFrames,
  frameTimes,
  timeLabel,
  type ManyMode,
} from "./extract";

type Mode = "screenshot" | "many" | "sheet";
type ManyKind = ManyMode["kind"];

const TYPES: { value: ImageType; label: string }[] = [
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/webp", label: "WebP" },
];

const WIDTHS = [
  { value: "original", label: "original size" },
  { value: "1920", label: "1920 px wide" },
  { value: "1280", label: "1280 px wide" },
  { value: "640", label: "640 px wide" },
  { value: "320", label: "320 px wide" },
];

/** Reads a video for this tool, which needs the browser to decode it. */
async function load(file: File) {
  const info = await inspectMedia(file).catch((err: unknown) => {
    if (err instanceof FriendlyError && err.name === "NeedsEngineError") {
      throw new FriendlyError(
        `Couldn't open ${file.name}.`,
      );
    }
    throw err;
  });
  if (!info.video[0]?.canDecode) {
    throw new FriendlyError(
      `Couldn't open the video in ${file.name}.`,
    );
  }
  return info;
}

export default function Frames() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [mode, setMode] = useState<Mode>("screenshot");
  const [type, setType] = useState<ImageType>("image/png");
  const take = (items: Parameters<typeof toMediaFiles>[0]) =>
    setMedia(toMediaFiles(items)[0] ?? null);

  const sidebar = media ? (
    <>
      <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
        <PanelSection title="what to save">
          <Segmented
            label="What to save"
            value={mode}
            onChange={setMode}
            options={[
              { value: "screenshot", label: "one frame" },
              { value: "many", label: "many" },
              { value: "sheet", label: "contact sheet" },
            ]}
          />
          <Field label="image format">
            <Segmented label="Image format" value={type} onChange={setType} options={TYPES} />
          </Field>
        </PanelSection>
      </div>
      {mode === "many" && <ManyPanel media={media} type={type} />}
      {mode === "sheet" && <SheetPanel media={media} type={type} />}
      {mode === "screenshot" && (
        <PrivacyNote>Step frame by frame with the arrow buttons, or the , and . keys.</PrivacyNote>
      )}
    </>
  ) : undefined;

  const drop = (
    <FileDrop
      accept={["video"]}
      compact={!!media}
      subtitle="Save a still, pull out many frames as ZIP, make a contact sheet"
      load={load}
      onLoad={take}
    />
  );

  return (
    <ToolLayout toolId="frames" sidebar={sidebar}>
      <FileActionsContext.Provider value={media ? drop : null}>
      {media &&
        (mode === "screenshot" ? (
          <Screenshot media={media} type={type} />
        ) : (
          <Player media={media} />
        ))}
      {!media && drop}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}

function Player({
  media,
  mediaRef,
}: {
  media: MediaFile;
  mediaRef?: RefObject<HTMLVideoElement | null>;
}) {
  const url = useObjectUrl(media.file);
  return url ? <MediaPreview src={url} mediaRef={mediaRef} /> : null;
}

/** The player with frame stepping, and buttons to save or copy the frame on screen. */
function Screenshot({ media, type }: { media: MediaFile; type: ImageType }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fps = media.info.video[0]?.fps ?? 30;

  const step = (frames: number) => {
    const el = video.current;
    if (!el) return;
    el.pause();
    el.currentTime = Math.min(Math.max(0, el.currentTime + frames / fps), el.duration || Infinity);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === ",") step(-1);
      else if (e.key === ".") step(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const name = () => {
    const t = video.current?.currentTime ?? 0;
    return `${baseName(media.file.name)}-${timeLabel(t)}.${IMAGE_EXT[type]}`;
  };
  const [saved, setSaved] = useState<File | null>(null);
  const save = async () => {
    try {
      const blob = await grabFrame(video.current!, type);
      downloadBlob(blob, name());
      setSaved(new File([blob], name(), { type }));
      setMessage({ text: `saved ${name()}` });
    } catch (err) {
      setMessage({ text: friendlyMessage(err, "Couldn't save the frame."), error: true });
    }
  };
  const copy = async () => {
    try {
      // The clipboard only takes PNG images everywhere.
      const blob = await grabFrame(video.current!, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMessage({ text: "copied the frame" });
    } catch (err) {
      setMessage({
        text: friendlyMessage(err, "This browser didn't allow copying the image."),
        error: true,
      });
    }
  };

  return (
    <div className="space-y-3">
      <Player media={media} mediaRef={video} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => step(-1)} aria-label="Previous frame" title="Previous frame (,)">
          <ChevronLeft className="size-4" aria-hidden /> frame
        </Button>
        <Button onClick={() => step(1)} aria-label="Next frame" title="Next frame (.)">
          frame <ChevronRight className="size-4" aria-hidden />
        </Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => void save()}>
          <Camera className="size-4" aria-hidden />
          save this frame
        </Button>
        <Button onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden />
          copy
        </Button>
      </div>
      {message && (
        <p
          className={`flex items-center gap-1.5 text-sm ${message.error ? "text-red-700" : "text-ink-2"}`}
        >
          {!message.error && <Check className="size-4" aria-hidden />}
          {message.text}
        </p>
      )}
      {saved && <OpenIn file={saved} exclude="frames" />}
      <p className="text-xs text-ink-3">
        Frames are saved at the video's full size ({media.info.video[0]?.width}×
        {media.info.video[0]?.height}).
      </p>
    </div>
  );
}

function ManyPanel({ media, type }: { media: MediaFile; type: ImageType }) {
  const [kind, setKind] = useState<ManyKind>("count");
  const [seconds, setSeconds] = useState(5);
  const [count, setCount] = useState(10);
  const duration = media.info.duration;
  const [range, setRange] = useState({ start: 0, end: Math.min(duration, 2) });
  const [width, setWidth] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const fps = media.info.video[0]?.fps ?? 30;

  const mode: ManyMode =
    kind === "every"
      ? { kind, seconds }
      : kind === "count"
        ? { kind, count }
        : kind === "all"
          ? { kind, ...range }
          : { kind };
  const expected = kind === "keyframes" ? null : frameTimes(mode, duration, fps).length;

  return (
    <>
      <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
        <PanelSection title="which frames">
          <Select
            label="Which frames"
            value={kind}
            onChange={setKind}
            options={[
              { value: "count", label: "a number of frames, evenly spread" },
              { value: "every", label: "one every few seconds" },
              { value: "keyframes", label: "keyframes only (scene starts, fast)" },
              { value: "all", label: "every frame in a part" },
            ]}
          />
          {kind === "count" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={1}
                max={MAX_FRAMES}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className={`${inputClass} w-24 py-1.5`}
                aria-label="Number of frames"
              />
              frames
            </label>
          )}
          {kind === "every" && (
            <label className="flex items-center gap-2 text-sm">
              every
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value) || 1)}
                className={`${inputClass} w-24 py-1.5`}
                aria-label="Seconds between frames"
              />
              seconds
            </label>
          )}
          {kind === "all" && (
            <RangeFields
              start={range.start}
              end={range.end}
              duration={duration}
              onChange={setRange}
            />
          )}
          <Field label="size">
            <Select
              label="Size"
              value={width ? String(width) : "original"}
              onChange={(v) => setWidth(v === "original" ? null : Number(v))}
              options={WIDTHS.filter(
                (w) =>
                  w.value === "original" || Number(w.value) < (media.info.video[0]?.width ?? 0),
              )}
            />
          </Field>
        </PanelSection>
      </div>
      <p className="text-sm text-ink-2">
        {expected === null
          ? "one image per keyframe"
          : `${expected} image${expected === 1 ? "" : "s"}`}
        {expected === MAX_FRAMES ? ` (the most at once)` : ""}, saved as a ZIP
      </p>
      <ActionButton onClick={() => setRunning(true)}>save frames</ActionButton>
      {running && (
        <ExportDialog
          running="saving frames…"
          failed="couldn't save the frames"
          zipName={`${baseName(media.file.name)}-frames.zip`}
          onClose={() => setRunning(false)}
          run={async ({ signal, progress }) => ({
            files: await extractFrames({
              file: media.file,
              info: media.info,
              mode,
              type,
              width,
              signal,
              onProgress: (f) => progress(f, "saving frames…"),
            }),
          })}
        />
      )}
    </>
  );
}

function SheetPanel({ media, type }: { media: MediaFile; type: ImageType }) {
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(5);
  const [width, setWidth] = useState(1920);
  const [running, setRunning] = useState(false);
  const numbers = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      value: String(from + i),
      label: String(from + i),
    }));

  return (
    <>
      <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
        <PanelSection title="contact sheet">
          <div className="grid grid-cols-2 gap-2">
            <Field label="columns">
              <Select
                label="Columns"
                value={String(columns)}
                onChange={(v) => setColumns(Number(v))}
                options={numbers(2, 8)}
              />
            </Field>
            <Field label="rows">
              <Select
                label="Rows"
                value={String(rows)}
                onChange={(v) => setRows(Number(v))}
                options={numbers(2, 12)}
              />
            </Field>
          </div>
          <Field label="sheet width">
            <Select
              label="Sheet width"
              value={String(width)}
              onChange={(v) => setWidth(Number(v))}
              options={[1280, 1920, 2560, 3840].map((w) => ({
                value: String(w),
                label: `${w} px`,
              }))}
            />
          </Field>
        </PanelSection>
      </div>
      <p className="text-sm text-ink-2">
        {columns * rows} thumbnails, one every{" "}
        {formatTime(media.info.duration / (columns * rows), 1)}
      </p>
      <ActionButton onClick={() => setRunning(true)}>make contact sheet</ActionButton>
      {running && (
        <ExportDialog
          running="making the contact sheet…"
          failed="couldn't make the contact sheet"
          onClose={() => setRunning(false)}
          run={async ({ signal, progress }) => {
            const blob = await contactSheet({
              file: media.file,
              info: media.info,
              columns,
              rows,
              width,
              type,
              signal,
              onProgress: (f) => progress(f, "taking thumbnails…"),
            });
            return {
              files: [
                { name: `${baseName(media.file.name)}-contact-sheet.${IMAGE_EXT[type]}`, blob },
              ],
            };
          }}
        />
      )}
    </>
  );
}
