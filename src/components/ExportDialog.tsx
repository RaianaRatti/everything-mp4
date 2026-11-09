import { Download, FileArchive, HardDrive, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { friendlyMessage } from "../lib/errors";
import { downloadBlob, formatBytes } from "../lib/files";
import { isAbort, useJobGuards } from "../lib/job";
import { useObjectUrl } from "../lib/objectUrl";
import { BIG_OUTPUT, MEMORY, canSaveToDisk, pickSaveFile, type OutputTarget } from "../lib/output";
import { formatTime } from "../lib/time";
import { saveZip } from "../lib/zip";
import { MediaPreview } from "./MediaPreview";
import { OpenIn } from "./OpenIn";
import { Button } from "./ui";

export interface JobContext {
  signal: AbortSignal;
  /** Reports progress from 0 to 1, with an optional plain description of the current stage. */
  progress: (fraction: number, label?: string) => void;
  /** Where a single big output should be written: memory, or a file the person picked. */
  target: OutputTarget;
}

export interface JobFile {
  name: string;
  blob: Blob;
}

export interface JobResult {
  files: JobFile[];
  /** Things that didn't go as asked ("saved without sound"). */
  warnings?: string[];
  /** Plain facts about the result ("instant, no quality loss"). */
  notes?: string[];
}

type Status =
  | { kind: "choose" }
  | { kind: "running"; fraction: number; label?: string; started: number }
  | { kind: "done"; result: JobResult; seconds: number }
  | { kind: "error"; message: string };

/**
 * Runs a job and shows its progress, time left and a cancel button, then a preview of the result
 * with downloads (a ZIP when there are several files). When the result will be over about 1 GB,
 * it first offers to save it straight to disk so it never has to fit in memory.
 */
export function ExportDialog({
  running,
  failed,
  run,
  onClose,
  estimate,
  zipName = "everything-mp4.zip",
  renderResult,
}: {
  /** The heading while the job runs, e.g. "converting…". */
  running: string;
  /** The heading if it fails, e.g. "couldn't convert". */
  failed: string;
  run: (ctx: JobContext) => Promise<JobResult>;
  onClose: () => void;
  /** The expected single output, used to offer saving straight to disk when it's big. */
  estimate?: { bytes: number; name: string; mimeType: string };
  zipName?: string;
  /** Replaces the default preview of the result. */
  renderResult?: (result: JobResult) => ReactNode;
}) {
  const big = !!estimate && estimate.bytes > BIG_OUTPUT && canSaveToDisk();
  const [target, setTarget] = useState<OutputTarget | null>(big ? null : MEMORY);
  const [status, setStatus] = useState<Status>(() =>
    big ? { kind: "choose" } : { kind: "running", fraction: 0, started: performance.now() },
  );
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  const start = (next: OutputTarget) => {
    setTarget(next);
    setStatus({ kind: "running", fraction: 0, started: performance.now() });
  };

  useJobGuards(status.kind === "running", status.kind === "running" ? status.fraction : 0);

  useEffect(() => {
    if (!target) return;
    const abort = new AbortController();
    const t0 = performance.now();
    let last = 0;
    runRef
      .current({
        signal: abort.signal,
        target,
        progress: (fraction, label) => {
          if (abort.signal.aborted) return;
          // Repaint at most ~10 times a second; jobs can report thousands of times.
          const now = performance.now();
          if (now - last < 100 && fraction < 1) return;
          last = now;
          setStatus({
            kind: "running",
            fraction: Math.min(1, Math.max(0, fraction)),
            label,
            started: t0,
          });
        },
      })
      .then(
        (result) => {
          if (abort.signal.aborted) return;
          setStatus({ kind: "done", result, seconds: (performance.now() - t0) / 1000 });
        },
        (err: unknown) => {
          if (abort.signal.aborted || isAbort(err)) return;
          console.error(err);
          setStatus({ kind: "error", message: friendlyMessage(err, errorText(err)) });
        },
      );
    return () => abort.abort(new DOMException("Canceled", "AbortError"));
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const heading =
    status.kind === "running" || status.kind === "choose"
      ? running
      : status.kind === "done"
        ? "done!"
        : failed;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal
      aria-label={heading}
    >
      <div className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border-2 border-ink bg-card p-5 shadow-pop-sm">
        <div className="flex items-center gap-1">
          <h2 className="text-xl">{heading}</h2>
          <span className="flex-1" />
          {status.kind === "done" &&
            target?.kind !== "disk" &&
            status.result.files.length === 1 &&
            status.result.files[0] && (
              <OpenIn
                file={
                  new File([status.result.files[0].blob], status.result.files[0].name, {
                    type: status.result.files[0].blob.type,
                  })
                }
              />
            )}
          <button
            type="button"
            onClick={onClose}
            aria-label={status.kind === "running" ? "Cancel" : "Close"}
            className="rounded-md p-1 hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </div>

        {status.kind === "choose" && estimate && (
          <>
            <p className="text-sm text-ink-2">
              The result will be about {formatBytes(estimate.bytes)}, too big to hold in memory
              comfortably. Choose where to save it and it's written straight to disk as it's made.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() =>
                  void pickSaveFile(estimate.name, estimate.mimeType).then(
                    (handle) => start({ kind: "disk", handle }),
                    () => {},
                  )
                }
              >
                <HardDrive className="size-4" aria-hidden />
                choose where to save
              </Button>
              <Button onClick={() => start(MEMORY)}>keep it in memory</Button>
            </div>
          </>
        )}

        {status.kind === "running" && (
          <Progress fraction={status.fraction} label={status.label} started={status.started} />
        )}
        {status.kind === "running" && <Button onClick={onClose}>cancel</Button>}

        {status.kind === "done" && (
          <Result
            result={status.result}
            seconds={status.seconds}
            onDisk={target?.kind === "disk"}
            zipName={zipName}
            renderResult={renderResult}
          />
        )}

        {status.kind === "error" && (
          <>
            <p className="text-sm text-red-700">{status.message}</p>
          </>
        )}
      </div>
    </div>
  );
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}

function Progress({
  fraction,
  label,
  started,
}: {
  fraction: number;
  label?: string;
  started: number;
}) {
  // Re-render every second so "time left" counts down even between progress reports.
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = (now - started) / 1000;
  const left = fraction > 0.02 && elapsed > 2 ? (elapsed * (1 - fraction)) / fraction : null;

  return (
    <>
      <div className="h-5 overflow-hidden rounded-md border-2 border-ink bg-paper-3">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className="text-sm text-ink-2">
        {label ?? "working…"} {Math.floor(fraction * 100)}%
        {left !== null && <> · about {formatTime(Math.max(1, left), 0)} left</>}
      </p>
      <p className="text-xs text-ink-3">
        Keep this tab open until it's finished.
      </p>
    </>
  );
}

function Result({
  result,
  seconds,
  onDisk,
  zipName,
  renderResult,
}: {
  result: JobResult;
  seconds: number;
  onDisk: boolean;
  zipName: string;
  renderResult?: (result: JobResult) => ReactNode;
}) {
  const { files } = result;
  const first = files[0];
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const total = files.reduce((sum, f) => sum + f.blob.size, 0);

  return (
    <>
      {renderResult
        ? renderResult(result)
        : first && files.length === 1 && <BlobPreview blob={first.blob} />}
      {result.warnings?.map((w) => (
        <p key={w} className="text-sm text-red-700">
          {w}
        </p>
      ))}
      {result.notes?.map((n) => (
        <p key={n} className="text-sm text-ink-2">
          {n}
        </p>
      ))}
      <p className="text-sm text-ink-2">
        {files.length > 1 ? `${files.length} files · ` : ""}
        {formatBytes(total)} · took {formatTime(seconds, 0)}
      </p>

      {files.length > 1 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border-2 border-ink p-2 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 text-xs text-ink-3">{formatBytes(f.blob.size)}</span>
              <OpenIn compact file={new File([f.blob], f.name, { type: f.blob.type })} />
              <button
                type="button"
                onClick={() => downloadBlob(f.blob, f.name)}
                aria-label={`Download ${f.name}`}
                className="shrink-0 rounded-sm p-1 hover:bg-accent"
              >
                <Download className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {zipError && <p className="text-sm text-red-700">{zipError}</p>}
      <div className="flex flex-wrap gap-2">
        {onDisk && first ? (
          <p className="flex items-center gap-2 text-sm">
            <HardDrive className="size-4" aria-hidden />
            saved as {first.name}
          </p>
        ) : files.length > 1 ? (
          <Button
            variant="primary"
            disabled={zipping}
            onClick={() => {
              setZipping(true);
              setZipError(null);
              saveZip(files, zipName)
                .catch((err: unknown) =>
                  setZipError(friendlyMessage(err, "Couldn't make the ZIP.")),
                )
                .finally(() => setZipping(false));
            }}
          >
            <FileArchive className="size-4" aria-hidden />
            {zipping ? "zipping…" : `download all (${zipName})`}
          </Button>
        ) : (
          first && (
            <Button variant="primary" onClick={() => downloadBlob(first.blob, first.name)}>
              <Download className="size-4" aria-hidden />
              download {first.name}
            </Button>
          )
        )}
      </div>
    </>
  );
}

/** Shows a result file: a player for video and audio, the picture for images. */
export function BlobPreview({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  const [failed, setFailed] = useState(false);
  if (!url) return null;
  if (failed) {
    return (
      <p className="rounded-md border-2 border-ink bg-paper-2 p-3 text-sm text-ink-2">
        This browser can't play this format, so there's no preview. The file itself is fine.
      </p>
    );
  }
  const type = blob.type;
  if (type.startsWith("image/")) {
    return (
      <img
        src={url}
        alt="Result"
        onError={() => setFailed(true)}
        className="max-h-80 w-full rounded-md border-2 border-ink bg-paper-3 object-contain"
      />
    );
  }
  if (type.startsWith("audio/") || type.startsWith("video/")) {
    return (
      <MediaPreview
        src={url}
        kind={type.startsWith("audio/") ? "audio" : "video"}
        small
        fallback={
          <p className="rounded-md border-2 border-ink bg-paper-2 p-3 text-sm text-ink-2">
            No preview for this format. The file itself is fine.
          </p>
        }
      />
    );
  }
  return null;
}
