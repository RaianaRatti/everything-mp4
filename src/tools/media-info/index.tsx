import { AudioLines, Check, ChevronDown, Copy, FileDown, Film, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { EnginePanel } from "../../components/EnginePanel";
import { FileDrop } from "../../components/FileDrop";
import { ToolLayout } from "../../components/ToolLayout";
import { Button } from "../../components/ui";
import { browserCapabilities, type BrowserCapabilities } from "../../lib/engine/capabilities";
import { mediaWarnings, type MediaInfo } from "../../lib/engine/inspect";
import {
  AUDIO_CODECS,
  AUDIO_FORMATS,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  ffmpegMuxer,
} from "../../lib/engine/formats";
import { useEngineSupport, useMediaLoader } from "../../lib/ffmpeg/hooks";
import { downloadBlob, formatBitrate, formatBytes } from "../../lib/files";
import { useObjectUrl } from "../../lib/objectUrl";
import { formatTime } from "../../lib/time";
import { channelsText, jsonReport, sections, textReport } from "./report";

/** Rows that are useful in the text/JSON reports but only clutter the page. */
const HIDDEN_ROWS = new Set(["codec string", "read by", "plays in this browser"]);

interface Entry {
  id: number;
  file: File;
  info: MediaInfo;
}

let nextId = 0;

export default function MediaInfoTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [copied, setCopied] = useState(false);
  const add = (items: { file: File; result: MediaInfo }[]) =>
    setEntries((prev) => [
      ...prev,
      ...items.map((i) => ({ id: nextId++, file: i.file, info: i.result })),
    ]);
  const loader = useMediaLoader(add);
  const all = entries.map((e) => e.info);
  const drop = (
    <FileDrop
      accept={["video", "audio"]}
      multiple
      compact={entries.length > 0}
      title={entries.length ? "add more files" : "drop videos or audio files here"}
      subtitle="See their format, size, codecs, resolution, frame rate and more"
      load={loader.load}
      onLoad={add}
    />
  );

  return (
    <ToolLayout toolId="media-info">
      {loader.waiting.length > 0 && (
        <EnginePanel
          reason={`Reading ${loader.waiting.map((f) => f.name).join(", ")} uses the video engine.`}
        />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}

      {entries.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(textReport(all)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "copied" : "copy as text"}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              downloadBlob(
                new Blob([jsonReport(all)], { type: "application/json" }),
                entries.length === 1 ? `${all[0]!.name}-info.json` : "media-info.json",
              )
            }
          >
            <FileDown className="size-4" aria-hidden />
            download JSON
          </Button>
          {drop}
        </div>
      )}

      {entries.map((entry) => (
        <InfoCard
          key={entry.id}
          entry={entry}
          onRemove={() => setEntries((p) => p.filter((e) => e.id !== entry.id))}
        />
      ))}

      {!entries.length && drop}

      <Capabilities />
    </ToolLayout>
  );
}

/** The first frame of a video the browser can play, or an icon. */
function Thumb({ entry }: { entry: Entry }) {
  const url = useObjectUrl(entry.file);
  const video = entry.info.video.length > 0;
  return (
    <div className="flex aspect-video w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border-3 border-ink bg-ink sm:w-40">
      {video && entry.info.canPlay && url ? (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="pointer-events-none size-full object-cover"
        />
      ) : video ? (
        <Film className="size-7 text-paper" aria-hidden />
      ) : (
        <AudioLines className="size-7 text-paper" aria-hidden />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border-3 border-ink bg-paper-2 px-3 py-2">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="truncate text-lg leading-tight" title={value}>
        {value}
      </p>
    </div>
  );
}

function InfoCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const { info } = entry;
  const warnings = mediaWarnings(info);
  const video = info.video[0];
  const audio = info.audio[0];
  const stats: [string, string][] = [
    ["length", formatTime(info.duration, 1)],
    ["size", formatBytes(info.size)],
    video ? ["picture", `${video.width}×${video.height}`] : ["sound", audio ? channelsText(audio.channels) : "none"],
    video?.fps
      ? ["frame rate", `${video.fps} fps`]
      : audio
        ? ["sample rate", `${(audio.sampleRate / 1000).toLocaleString()} kHz`]
        : ["bitrate", info.bitrate ? formatBitrate(info.bitrate) : "—"],
  ];
  const details = sections(info)
    .map((s) => ({
      ...s,
      rows: s.rows.filter(([label, value]) => !HIDDEN_ROWS.has(label) && !(label === "HDR" && value === "no")),
    }))
    .filter((s) => s.rows.length);

  return (
    <section aria-label={info.name} className="space-y-5 rounded-lg border-3 border-ink bg-card p-4 shadow-pop sm:p-5">
      <header className="flex items-center gap-4">
        <Thumb entry={entry} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-xl" title={info.name}>
            {info.name}
          </h2>
          <p className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-sm border-2 border-ink bg-accent px-1.5 py-0.5">{info.format.name}</span>
            {video && <span className="rounded-sm border-2 border-ink px-1.5 py-0.5">{video.codec}</span>}
            {audio && <span className="rounded-sm border-2 border-ink px-1.5 py-0.5">{audio.codec}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 self-start rounded-md p-2 hover:bg-accent"
          aria-label={`Remove ${info.name}`}
          title="Remove"
        >
          <Trash2 className="size-5" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-2">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 border-l-4 border-accent pl-3 text-sm text-ink-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {details.map((section) => (
          <div key={section.title} className="overflow-hidden rounded-md border-3 border-ink">
            <h3 className="border-b-3 border-ink bg-paper-2 px-3 py-1.5 text-xs tracking-wide uppercase">
              {section.title}
            </h3>
            <dl className="divide-y divide-ink/15 px-3 text-sm">
              {section.rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                  <dt className="shrink-0 text-ink-3">{label}</dt>
                  <dd className="min-w-0 text-right break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** What this browser can play and make, and what the video engine adds, tucked away by default. */
function Capabilities() {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const support = useEngineSupport();
  useEffect(() => {
    if (!open || caps) return;
    let live = true;
    void browserCapabilities().then((c) => live && setCaps(c));
    return () => {
      live = false;
    };
  }, [open, caps]);

  const engine = support
    ? [
        ...VIDEO_FORMATS.filter((f) => support.muxers.has(ffmpegMuxer(f.container))).map((f) => f.label),
        ...AUDIO_FORMATS.filter((f) => support.muxers.has(ffmpegMuxer(f.container))).map((f) => f.label),
        ...[...Object.values(VIDEO_CODECS), ...Object.values(AUDIO_CODECS)]
          .filter((c) => c.ff && support.encoders.has(c.ff))
          .map((c) => c.label),
      ]
    : null;

  return (
    <section className="rounded-lg border-3 border-ink bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        what this browser can do
        <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="grid gap-4 border-t-3 border-ink p-4 sm:grid-cols-2">
          {!caps ? (
            <p className="text-sm text-ink-3">checking…</p>
          ) : (
            <>
              <Chips title="plays" items={caps.play} />
              <Chips title="makes video" items={caps.encodeVideo} />
              <Chips title="reads video" items={caps.decodeVideo} />
              <Chips title="makes sound" items={caps.encodeAudio} />
              <Chips title="reads sound" items={caps.decodeAudio} />
            </>
          )}
          {engine && (
            <Chips title="with the video engine" items={engine.map((label) => ({ id: label, label, ok: true }))} />
          )}
        </div>
      )}
    </section>
  );
}

function Chips({ title, items }: { title: string; items: { id: string; label: string; ok: boolean }[] }) {
  const ok = items.filter((i) => i.ok);
  return (
    <div className="space-y-1.5">
      <p className="text-xs tracking-wide text-ink-3 uppercase">{title}</p>
      <ul className="flex flex-wrap gap-1">
        {ok.map((item) => (
          <li key={item.id} className="rounded-sm border-2 border-ink bg-paper-2 px-1.5 py-0.5 text-xs">
            {item.label}
          </li>
        ))}
        {!ok.length && <li className="text-xs text-ink-3">none</li>}
      </ul>
    </div>
  );
}
