import { useRef, useState, type ReactNode, type RefObject } from "react";
import { runFfmpeg, useEngine } from "../lib/ffmpeg/engine";
import { useEngineWhenNeeded, useMediaLoader } from "../lib/ffmpeg/hooks";
import type { FileKind } from "../lib/files";
import { toMediaFiles, type MediaFile } from "../lib/mediaFiles";
import { useObjectUrl } from "../lib/objectUrl";
import { EnginePanel } from "./EnginePanel";
import { FileActionsContext } from "./FileActions";
import { ExportDialog, type JobFile, type JobResult } from "./ExportDialog";
import { FileDrop } from "./FileDrop";
import { FilePreview } from "./MediaFiles";
import { MediaPreview } from "./MediaPreview";
import { ActionButton, ToolLayout } from "./ToolLayout";

/** One ffmpeg run. Inputs are the page's files (in order) plus `extraInputs`. */
export interface EngineJob {
  args: (inputs: string[]) => string[];
  /** Seconds of output, for progress. */
  duration: number;
  /** The download name when the run writes one file; several files keep ffmpeg's names. */
  name?: string;
  mime: string;
  extraInputs?: File[];
  /** Use only these of the page's files, by index. */
  only?: number[];
  /** Plain notes read from ffmpeg's log after the run (e.g. loudness before and after). */
  notes?: (log: string[]) => string[];
}

/**
 * The page shared by the editing tools that run on the video engine: a drop zone, the tool's own
 * main content and settings, an engine panel, one action button, and the export dialog.
 */
export function EnginePage({
  toolId,
  subtitle,
  media,
  onMedia,
  multiple = false,
  accept = ["video"],
  settings,
  before,
  children,
  action,
  running,
  disabled,
  jobs,
  notes,
  renderResult,
}: {
  toolId: string;
  subtitle: string;
  media: MediaFile[];
  /** Files just loaded (add them, or replace the current one). */
  onMedia: (files: MediaFile[]) => void;
  multiple?: boolean;
  accept?: FileKind[];
  settings?: ReactNode;
  /** A separate box above the settings (e.g. picking a second file). */
  before?: ReactNode;
  children?: ReactNode;
  action: string;
  running: string;
  /** A reason shown above the button, or just true to grey it out quietly. */
  disabled?: string | boolean;
  jobs: () => EngineJob[] | Promise<EngineJob[]>;
  notes?: string[];
  renderResult?: (result: JobResult) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const take = (items: Parameters<typeof toMediaFiles>[0]) => onMedia(toMediaFiles(items));
  const loader = useMediaLoader(take);
  const status = useEngineWhenNeeded(media.length > 0);
  const ready = useEngine((s) => s.status === "ready");

  const drop = (
    <FileDrop
      accept={accept}
      multiple={multiple}
      compact={media.length > 0}
      subtitle={subtitle}
      load={loader.load}
      onLoad={take}
    />
  );

  const sidebar = media.length ? (
    <>
      {before && <div className="rounded-lg border-2 border-ink bg-card">{before}</div>}
      {settings && (
        <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
          {settings}
        </div>
      )}
      {typeof disabled === "string" && disabled && (
        <p className="text-sm text-red-700">{disabled}</p>
      )}
      {!ready && <EnginePanel reason="This tool uses the video engine." />}
      <ActionButton disabled={status !== "ready" || !!disabled} onClick={() => setOpen(true)}>
        {action}
      </ActionButton>
    </>
  ) : undefined;

  return (
    <ToolLayout toolId={toolId} sidebar={sidebar}>
      {loader.waiting.length > 0 && (
        <EnginePanel reason={`This browser can't read ${loader.waiting[0]!.name} by itself.`} />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}
      <FileActionsContext.Provider value={media.length && !multiple ? drop : null}>
        {children}
      </FileActionsContext.Provider>
      {!media.length ? drop : multiple && <div className="flex justify-end">{drop}</div>}
      {open && (
        <ExportDialog
          running={running}
          failed="couldn't finish"
          onClose={() => setOpen(false)}
          renderResult={renderResult}
          run={async ({ signal, progress }) => {
            const list = await jobs();
            const files: JobFile[] = [];
            const found: string[] = [...(notes ?? [])];
            for (const [i, job] of list.entries()) {
              const inputs = media
                .filter((_, k) => !job.only || job.only.includes(k))
                .map((m) => m.file);
              const { outputs, log } = await runFfmpeg({
                inputs: [...inputs, ...(job.extraInputs ?? [])],
                duration: job.duration,
                signal,
                onProgress: (f) => progress((i + f) / list.length),
                args: job.args,
              });
              if (job.notes) found.push(...job.notes(log));
              const single = outputs.length === 1 && job.name;
              for (const o of outputs) {
                files.push({
                  name: single ? job.name! : o.name,
                  blob: new Blob([o.data], { type: job.mime }),
                });
              }
            }
            return { files, notes: found };
          }}
        />
      )}
    </ToolLayout>
  );
}

/** A player for one file, with its element and current time exposed for a timeline. */
export function usePlayer() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const seek = (t: number) => {
    if (ref.current) ref.current.currentTime = t;
    setTime(t);
  };
  return { ref, time, setTime, seek };
}

export function Player({
  media,
  player,
  range,
  playbackRate,
  onRemove,
  stage,
}: {
  media: MediaFile;
  player: { ref: RefObject<HTMLVideoElement | null>; setTime: (t: number) => void };
  range?: { start: number; end: number };
  playbackRate?: number;
  /** Shows a remove button on the card used for files this browser can't play. */
  onRemove?: () => void;
  stage?: (video: ReactNode) => ReactNode;
}) {
  const url = useObjectUrl(media.file);
  if (!media.info.canPlay || !url)
    return <FilePreview file={media.file} info={media.info} onRemove={onRemove} />;
  return (
    <MediaPreview
      onRemove={onRemove}
      src={url}
      kind={media.info.video.length ? "video" : "audio"}
      mediaRef={player.ref}
      onTime={player.setTime}
      range={range}
      playbackRate={playbackRate}
      stage={stage}
    />
  );
}
