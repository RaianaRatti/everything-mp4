import { AudioLines, Film, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { MediaInfo } from "../lib/engine/inspect";
import { runFfmpeg, useEngine } from "../lib/ffmpeg/engine";
import type { MediaFile } from "../lib/mediaFiles";
import { useObjectUrl } from "../lib/objectUrl";
import { FileActions } from "./FileActions";
import { MediaPreview } from "./MediaPreview";

/** The files a tool is working on, with the selected one highlighted (it's the one previewed). */
export function MediaFileList({
  files,
  selected,
  onSelect,
  onRemove,
  extra,
}: {
  files: MediaFile[];
  selected: number | null;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
  /** Something to show per file, e.g. its estimated new size. */
  extra?: (file: MediaFile) => ReactNode;
}) {
  if (files.length < 2) return null;
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id}>
          <div
            className={`flex items-center gap-3 rounded-md border-2 border-ink bg-card px-3 py-2 ${
              f.id === selected ? "shadow-pop-sm" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              aria-pressed={f.id === selected}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm" title={f.file.name}>
                {f.file.name}
              </span>
            </button>
            {extra?.(f)}
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              aria-label={`Remove ${f.file.name}`}
              className="shrink-0 rounded-md p-1.5 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Previews a file: a player when this browser can play it, otherwise a card with its first frame
 * (made by the video engine when it's running), its name and a remove button.
 */
export function FilePreview({
  file,
  info,
  onRemove,
  number = 1,
}: {
  file: File;
  info: MediaInfo;
  onRemove?: () => void;
  number?: number;
}) {
  const url = useObjectUrl(file);
  const kind = info.video.length ? "video" : "audio";
  const card = <FileCard file={file} info={info} onRemove={onRemove} number={number} />;
  if (!info.canPlay || !url) return card;
  return <MediaPreview src={url} kind={kind} fallback={card} onRemove={onRemove} />;
}

function FileCard({
  file,
  info,
  onRemove,
  number,
}: {
  file: File;
  info: MediaInfo;
  onRemove?: () => void;
  number: number;
}) {
  const status = useEngine((s) => s.status);
  const [frame, setFrame] = useState<{ file: File; url: string } | null>(null);
  const hasVideo = info.video.length > 0;

  useEffect(() => {
    if (status !== "ready" || !hasVideo) return;
    const abort = new AbortController();
    let url: string | null = null;
    void runFfmpeg({
      inputs: [file],
      signal: abort.signal,
      args: ([input]) => [
        "-i",
        input!,
        "-frames:v",
        "1",
        "-vf",
        "scale=320:-2",
        "-q:v",
        "5",
        "/out/first.jpg",
      ],
    }).then(
      ({ outputs }) => {
        if (abort.signal.aborted || !outputs[0]) return;
        url = URL.createObjectURL(new Blob([outputs[0].data], { type: "image/jpeg" }));
        setFrame({ file, url });
      },
      () => {},
    );
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, hasVideo, status]);

  const src = frame?.file === file ? frame.url : null;
  return (
    <div className="flex items-center gap-4 rounded-lg border-2 border-ink bg-card p-3">
      <div className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-ink bg-ink sm:w-36">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : hasVideo ? (
          <Film className="size-6 text-paper" aria-hidden />
        ) : (
          <AudioLines className="size-6 text-paper" aria-hidden />
        )}
      </div>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg" title={file.name}>
          {file.name}
        </p>
      </div>
      <FileActions onRemove={onRemove} className="shrink-0" />
    </div>
  );
}
