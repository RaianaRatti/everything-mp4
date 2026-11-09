import { FolderOpen, RotateCcw, X } from "lucide-react";
import { useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { EnginePanel } from "../../components/EnginePanel";
import { FilePickerButton } from "../../components/FileDrop";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Button, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import { inspectMedia } from "../../lib/engine/inspect";
import { friendlyMessage } from "../../lib/errors";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { useEngineWhenNeeded } from "../../lib/ffmpeg/hooks";
import { inspectWithEngine } from "../../lib/ffmpeg/inspect";
import { acceptFor, baseName, fileKind, formatBytes } from "../../lib/files";
import { saveZip } from "../../lib/zip";
import { PLATFORMS } from "../make-for/platforms";
import { DEFAULT_SETTINGS, TASKS, batchJob, type BatchSettings, type TaskId } from "./tasks";

interface Item {
  id: number;
  file: File;
  status: "waiting" | "running" | "done" | "failed";
  progress: number;
  result?: File;
  error?: string;
}

let nextId = 1;

/** Every file inside dropped folders, including subfolders. */
async function filesFromDrop(e: ReactDragEvent): Promise<File[]> {
  const entries = [...e.dataTransfer.items]
    .map((i) => i.webkitGetAsEntry())
    .filter((x): x is FileSystemEntry => !!x);
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // Directory readers hand out entries in batches until an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

export default function Batch() {
  const [task, setTask] = useState<TaskId>("convert");
  const [s, setS] = useState<BatchSettings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [pattern, setPattern] = useState("{name}-{task}");
  const [output, setOutput] = useState<"zip" | "folder">("zip");
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const folderRef = useRef<FileSystemDirectoryHandle | null>(null);
  const status = useEngineWhenNeeded(true);
  const ready = useEngine((st) => st.status === "ready");
  const kinds = TASKS.find((t) => t.id === task)!.accepts;
  const set = (p: Partial<BatchSettings>) => setS({ ...s, ...p });

  const add = (files: File[]) => {
    const usable = files.filter((f) => {
      const k = fileKind(f);
      return k && kinds.includes(k);
    });
    setItems((prev) => [
      ...prev,
      ...usable.map((file) => ({ id: nextId++, file, status: "waiting" as const, progress: 0 })),
    ]);
  };
  const patch = (id: number, p: Partial<Item>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const nameFor = (item: Item, n: number, ext: string, suffix: string) =>
    `${pattern
      .replace(/\{name\}/g, baseName(item.file.name))
      .replace(/\{n\}/g, String(n).padStart(3, "0"))
      .replace(/\{task\}/g, suffix || task)
      .replace(/\{size\}/g, formatBytes(item.file.size).replace(/\s/g, ""))
      .replace(/[/\\:*?"<>|]/g, "_")}.${ext}`;

  const run = async () => {
    if (output === "folder") {
      try {
        folderRef.current = (await window.showDirectoryPicker?.({ mode: "readwrite" })) ?? null;
      } catch {
        return;
      }
    }
    stopRef.current = false;
    setRunning(true);
    setMessage(null);
    // The engine does one job at a time, so files go through one after another.
    let n = 0;
    for (const item of items) {
      n++;
      if (stopRef.current) break;
      if (item.status === "done") continue;
      const abort = new AbortController();
      abortRef.current = abort;
      patch(item.id, { status: "running", progress: 0, error: undefined });
      try {
        const info = await inspectMedia(item.file).catch(() => inspectWithEngine(item.file));
        const job = await batchJob(task, s, info);
        const { outputs } = await runFfmpeg({
          inputs: [item.file, ...(job.extraInputs ?? [])],
          duration: job.duration,
          signal: abort.signal,
          onProgress: (f) => patch(item.id, { progress: f }),
          args: job.args,
        });
        const result = new File([outputs[0]!.data], nameFor(item, n, job.ext, job.suffix), {
          type: job.mime,
        });
        if (folderRef.current) {
          const handle = await folderRef.current.getFileHandle(result.name, { create: true });
          const w = await handle.createWritable();
          await w.write(result);
          await w.close();
        }
        patch(item.id, { status: "done", progress: 1, result });
      } catch (err) {
        patch(item.id, {
          status: abort.signal.aborted ? "waiting" : "failed",
          error: abort.signal.aborted ? undefined : friendlyMessage(err, err instanceof Error ? err.message : "Failed."),
        });
      }
    }
    abortRef.current = null;
    setRunning(false);
  };

  const done = items.filter((i) => i.result);
  const sidebar = (
    <>
      <div className="divide-y-3 divide-ink rounded-lg border-3 border-ink bg-card">
        <PanelSection title="task">
          <Select
            label="Task"
            value={task}
            onChange={setTask}
            options={TASKS.map((t) => ({ value: t.id, label: t.label }))}
          />
          {task === "convert" && (
            <Segmented
              label="Format"
              value={s.convertTo}
              onChange={(convertTo) => set({ convertTo })}
              options={[
                { value: "mp4", label: "MP4" },
                { value: "webm", label: "WebM" },
              ]}
            />
          )}
          {task === "compress" && (
            <Field label={`${s.percent}% smaller`}>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={s.percent}
                onChange={(e) => set({ percent: Number(e.target.value) })}
                className="w-full accent-black"
                aria-label="Percent smaller"
              />
            </Field>
          )}
          {task === "resize" && (
            <Select
              label="Size"
              value={String(s.shortSide)}
              onChange={(v) => set({ shortSide: Number(v) })}
              options={["1080", "720", "480", "360"].map((x) => ({ value: x, label: `${x}p` }))}
            />
          )}
          {task === "rotate" && (
            <Segmented
              label="Turn"
              value={String(s.turn)}
              onChange={(v) => set({ turn: Number(v) as BatchSettings["turn"] })}
              options={[
                { value: "90", label: "90° ↻" },
                { value: "180", label: "180°" },
                { value: "270", label: "90° ↺" },
              ]}
            />
          )}
          {task === "extract-audio" && (
            <Segmented
              label="Audio format"
              value={s.audioFormat}
              onChange={(audioFormat) => set({ audioFormat })}
              options={[
                { value: "mp3", label: "MP3" },
                { value: "m4a", label: "M4A" },
                { value: "wav", label: "WAV" },
              ]}
            />
          )}
          {task === "make-for" && (
            <Select
              label="Platform"
              value={s.platform}
              onChange={(platform) => set({ platform })}
              options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
            />
          )}
        </PanelSection>
        <PanelSection title="output">
          <Field label="names">
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className={inputClass}
              aria-label="Name pattern"
            />
          </Field>
          {"showDirectoryPicker" in window && (
            <Segmented
              label="Save as"
              value={output}
              onChange={setOutput}
              options={[
                { value: "zip", label: "one ZIP" },
                { value: "folder", label: "into a folder" },
              ]}
            />
          )}
        </PanelSection>
      </div>
      {!ready && <EnginePanel reason="Batch uses the video engine." />}
      {running ? (
        <div className="flex gap-2">
          <Button onClick={() => (stopRef.current = true)}>pause after this file</Button>
          <Button onClick={() => abortRef.current?.abort()}>cancel this file</Button>
        </div>
      ) : (
        <ActionButton
          disabled={status !== "ready" || !items.some((i) => i.status !== "done")}
          onClick={() => void run()}
        >
          start
        </ActionButton>
      )}
      {done.length > 0 && output === "zip" && !running && (
        <Button
          variant="primary"
          onClick={() =>
            void saveZip(
              done.map((i) => ({ name: i.result!.name, blob: i.result! })),
              `batch-${task}.zip`,
            ).catch((err: unknown) => setMessage(friendlyMessage(err, "Couldn't make the ZIP.")))
          }
        >
          download {done.length} files (ZIP)
        </Button>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
    </>
  );

  return (
    <ToolLayout toolId="batch" sidebar={sidebar}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void filesFromDrop(e).then(add);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-3 border-dashed border-ink px-6 py-10 text-center ${
          over ? "bg-accent" : "bg-card"
        }`}
      >
        <p className="text-xl">drop many files or a folder</p>
        <div className="flex flex-wrap justify-center gap-2">
          <FilePickerButton accept={acceptFor(kinds)} onFiles={add}>
            choose files
          </FilePickerButton>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border-3 border-ink bg-card px-3 py-2 text-sm hover:bg-accent">
            <FolderOpen className="size-4" /> choose a folder
            <input
              type="file"
              hidden
              ref={(el) => el?.setAttribute("webkitdirectory", "")}
              onChange={(e) => {
                add([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border-3 border-ink bg-card p-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="shrink-0 text-xs text-ink-3">
                {item.status === "running"
                  ? `${Math.floor(item.progress * 100)}%`
                  : item.status === "done" && item.result
                    ? `${formatBytes(item.file.size)} → ${formatBytes(item.result.size)}`
                    : item.status === "failed"
                      ? "failed"
                      : "waiting"}
              </span>
              {item.status === "failed" && (
                <Button variant="ghost" aria-label="Retry" onClick={() => patch(item.id, { status: "waiting", error: undefined })}>
                  <RotateCcw className="size-4" />
                </Button>
              )}
              {!running && (
                <Button variant="ghost" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
                  <X className="size-4" />
                </Button>
              )}
              {item.error && <p className="w-full text-xs text-red-700">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </ToolLayout>
  );
}
