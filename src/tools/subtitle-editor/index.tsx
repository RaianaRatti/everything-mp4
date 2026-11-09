import { Merge, Plus, Redo2, Scissors, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FileDrop, FilePickerButton } from "../../components/FileDrop";
import { OpenIn } from "../../components/OpenIn";
import { Timeline } from "../../components/Timeline";
import { TimeInput } from "../../components/TimeInput";
import { ActionButton, PrivacyNote, ToolLayout } from "../../components/ToolLayout";
import { Button, Checkbox, Field, PanelSection, Select, inputClass } from "../../components/ui";
import { acceptFor, baseName, downloadBlob } from "../../lib/files";
import { takeHandoff } from "../../lib/handoff";
import { isTyping } from "../../lib/keys";
import { useObjectUrl } from "../../lib/objectUrl";
import {
  SUB_FORMATS,
  loadSubtitles,
  subtitleFile,
  type Cue,
  type SubFormat,
} from "../../lib/subtitles/format";

const SAVE_KEY = "everything-mp4-subtitles";
/** Faster than this (characters per second) is hard to read. */
const MAX_CPS = 20;

function wrap(text: string, max = 42): string {
  const words = text.replace(/\n/g, " ").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export default function SubtitleEditor() {
  const [cues, setCuesRaw] = useState<Cue[] | null>(null);
  const [past, setPast] = useState<Cue[][]>([]);
  const [future, setFuture] = useState<Cue[][]>([]);
  const [name, setName] = useState("subtitles");
  const [video, setVideo] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [active, setActive] = useState(0);
  const [format, setFormat] = useState<SubFormat>("srt");
  const [tap, setTap] = useState(false);
  const [tapStage, setTapStage] = useState<"start" | "end">("start");
  const [shift, setShift] = useState(0);
  const [syncA, setSyncA] = useState({ line: 1, time: 0 });
  const [syncB, setSyncB] = useState({ line: 2, time: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = useObjectUrl(video);

  const setCues = (next: Cue[]) => {
    if (cues) setPast((p) => [...p.slice(-99), cues]);
    setFuture([]);
    setCuesRaw(next);
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev || !cues) return;
    setFuture((f) => [cues, ...f]);
    setPast(past.slice(0, -1));
    setCuesRaw(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next || !cues) return;
    setPast((p) => [...p, cues]);
    setFuture(future.slice(1));
    setCuesRaw(next);
  };

  // A video sent from another tool (auto captions) comes along with its subtitles.
  useEffect(() => {
    const [v] = takeHandoff(["video", "audio"]);
    if (v) void Promise.resolve().then(() => setVideo(v));
  }, []);

  // Autosave, so a closed tab doesn't lose work.
  useEffect(() => {
    if (!cues) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ name, cues }));
    } catch {
      // Storage full or blocked: editing still works.
    }
  }, [cues, name]);
  const saved = (() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as { name: string; cues: Cue[] }) : null;
    } catch {
      return null;
    }
  })();

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setTime(t);
  };
  const list = cues ?? [];
  const total = Math.max(duration, ...list.map((c) => c.end + 2), 10);
  const current = list.find((c) => time >= c.start && time <= c.end);
  const patch = (i: number, p: Partial<Cue>) =>
    setCues(list.map((c, k) => (k === i ? { ...c, ...p, words: p.text !== undefined ? undefined : c.words } : c)));

  const latest = useRef({ tap, tapStage, active, time, list, undo, redo, patch });
  useEffect(() => {
    latest.current = { tap, tapStage, active, time, list, undo, redo, patch };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const l = latest.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) l.redo();
        else l.undo();
        return;
      }
      if (!l.tap || isTyping(e.target) || e.key.toLowerCase() !== "t") return;
      e.preventDefault();
      // Tap to time: T marks where the line starts, T again where it ends, then the next line.
      if (l.tapStage === "start") {
        l.patch(l.active, { start: l.time, end: Math.max(l.time + 0.5, l.list[l.active]?.end ?? 0) });
        setTapStage("end");
      } else {
        l.patch(l.active, { end: Math.max(l.time, (l.list[l.active]?.start ?? 0) + 0.2) });
        setTapStage("start");
        setActive((a) => Math.min(a + 1, l.list.length - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addAtPlayhead = () => {
    const next = [...list, { start: time, end: time + 2, text: "" }].sort((a, b) => a.start - b.start);
    setCues(next);
    setActive(next.findIndex((c) => c.start === time && c.text === ""));
  };
  const split = (i: number) => {
    const c = list[i]!;
    const words = c.text.split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const mid = (c.start + c.end) / 2;
    setCues([
      ...list.slice(0, i),
      { start: c.start, end: mid, text: words.slice(0, half).join(" ") },
      { start: mid, end: c.end, text: words.slice(half).join(" ") },
      ...list.slice(i + 1),
    ]);
  };
  const mergeNext = (i: number) => {
    const a = list[i]!;
    const b = list[i + 1];
    if (!b) return;
    setCues([...list.slice(0, i), { start: a.start, end: b.end, text: `${a.text} ${b.text}` }, ...list.slice(i + 2)]);
  };

  const resyncTwo = () => {
    const a = list[syncA.line - 1];
    const b = list[syncB.line - 1];
    if (!a || !b || a.start === b.start) return;
    const scale = (syncB.time - syncA.time) / (b.start - a.start);
    const map = (t: number) => syncA.time + (t - a.start) * scale;
    setCues(list.map((c) => ({ start: Math.max(0, map(c.start)), end: Math.max(0, map(c.end)), text: c.text })));
  };
  const scaleAll = (f: number) =>
    setCues(list.map((c) => ({ start: c.start * f, end: c.end * f, text: c.text })));

  const sidebar = cues ? (
    <>
      <div className="divide-y-3 divide-ink rounded-lg border-3 border-ink bg-card">
        <PanelSection title="save">
          <Select
            label="Format"
            value={format}
            onChange={setFormat}
            options={SUB_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </PanelSection>
        <PanelSection title="resync">
          <div className="flex items-end gap-2">
            <Field label="shift all (s)">
              <input
                type="number"
                step={0.1}
                value={shift}
                onChange={(e) => setShift(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Button
              onClick={() =>
                setCues(list.map((c) => ({ ...c, start: Math.max(0, c.start + shift), end: Math.max(0, c.end + shift) })))
              }
            >
              shift
            </Button>
          </div>
          <p className="text-xs text-ink-3">
            Or fix two lines: set when each should start, and everything else stretches to fit.
          </p>
          {[
            [syncA, setSyncA],
            [syncB, setSyncB],
          ].map(([s, set], k) => {
            const state = s as typeof syncA;
            const update = set as typeof setSyncA;
            return (
              <div key={k} className="flex items-end gap-2">
                <label className="block space-y-1">
                  <span className="text-xs text-ink-2">line</span>
                  <input
                    type="number"
                    min={1}
                    max={list.length}
                    value={state.line}
                    onChange={(e) => update({ ...state, line: Number(e.target.value) })}
                    className={`${inputClass} w-16`}
                  />
                </label>
                <TimeInput label="should start at" value={state.time} onCommit={(t) => update({ ...state, time: t })} />
              </div>
            );
          })}
          <Button onClick={resyncTwo}>stretch to fit</Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => scaleAll(23.976 / 25)}>23.976 → 25 fps</Button>
            <Button onClick={() => scaleAll(25 / 23.976)}>25 → 23.976 fps</Button>
          </div>
        </PanelSection>
        <PanelSection title="clean up">
          <Button
            onClick={() =>
              setCues(
                list
                  .map((c) => ({
                    ...c,
                    text: c.text
                      .replace(/\[[^\]]*\]|\([^)]*\)|♪+/g, "")
                      .replace(/[ \t]+/g, " ")
                      .replace(/^\s+|\s+$/gm, "")
                      .trim(),
                  }))
                  .filter((c) => c.text),
              )
            }
          >
            remove [music] and (laughs) notes
          </Button>
          <Button onClick={() => setCues(list.map((c) => ({ ...c, text: wrap(c.text) })))}>
            wrap long lines
          </Button>
        </PanelSection>
      </div>
      <ActionButton
        onClick={() => {
          const file = subtitleFile(list, format, name);
          downloadBlob(file, file.name);
        }}
      >
        download {format.toUpperCase()}
      </ActionButton>
      <OpenIn
        file={subtitleFile(list, format, name)}
        also={video ? [video] : []}
        exclude="subtitle-editor"
      />
      <PrivacyNote>Your work is saved in this browser as you go.</PrivacyNote>
    </>
  ) : undefined;

  return (
    <ToolLayout toolId="subtitle-editor" sidebar={sidebar}>
      {url ? (
        <div className="relative overflow-hidden rounded-md border-3 border-ink bg-black">
          <video
            ref={videoRef}
            src={url}
            controls
            loop
            playsInline
            className="max-h-[50vh] w-full"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          />
          {current && (
            <p className="pointer-events-none absolute inset-x-0 bottom-14 text-center">
              <span className="rounded bg-black/70 px-2 py-1 whitespace-pre-line text-white">{current.text}</span>
            </p>
          )}
        </div>
      ) : null}
      <FilePickerButton accept={acceptFor(["video", "audio"])} onFiles={(f) => f[0] && setVideo(f[0])}>
        {video ? "change video" : "add a video to watch while editing (optional)"}
      </FilePickerButton>

      {cues && (
        <>
          <Timeline
            duration={total}
            time={time}
            onSeek={seek}
            ranges={list}
            onRanges={(r) => setCues(r.map((x, i) => ({ ...list[i]!, start: x.start, end: x.end })))}
            active={active}
            onActive={setActive}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={addAtPlayhead}>
              <Plus className="size-4" /> add line at playhead
            </Button>
            <Button variant="ghost" aria-label="Undo" disabled={!past.length} onClick={undo}>
              <Undo2 className="size-4" />
            </Button>
            <Button variant="ghost" aria-label="Redo" disabled={!future.length} onClick={redo}>
              <Redo2 className="size-4" />
            </Button>
            <Checkbox
              checked={tap}
              onChange={(v) => {
                setTap(v);
                setTapStage("start");
              }}
              label="tap to time (press T at each start and end)"
            />
          </div>
          <ol className="max-h-[60vh] space-y-2 overflow-y-auto">
            {list.map((c, i) => {
              const cps = c.text.replace(/\s/g, "").length / Math.max(0.1, c.end - c.start);
              const overlap = list[i + 1] && list[i + 1]!.start < c.end;
              return (
                <li
                  key={i}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={`space-y-2 rounded-md border-3 p-2 ${i === active ? "border-ink bg-card" : "border-transparent"}`}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="pb-2 text-xs text-ink-3">{i + 1}</span>
                    <TimeInput label="start" value={c.start} onCommit={(t) => patch(i, { start: t })} />
                    <TimeInput label="end" value={c.end} onCommit={(t) => patch(i, { end: t })} />
                    <Button variant="ghost" onClick={() => seek(c.start)}>
                      play
                    </Button>
                    <Button variant="ghost" aria-label="Split line" onClick={() => split(i)}>
                      <Scissors className="size-4" />
                    </Button>
                    <Button variant="ghost" aria-label="Merge with next line" disabled={i === list.length - 1} onClick={() => mergeNext(i)}>
                      <Merge className="size-4" />
                    </Button>
                    <Button variant="ghost" aria-label="Delete line" onClick={() => setCues(list.filter((_, k) => k !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <textarea
                    value={c.text}
                    rows={2}
                    onChange={(e) => patch(i, { text: e.target.value })}
                    className={inputClass}
                    aria-label={`Text of line ${i + 1}`}
                  />
                  {cps > MAX_CPS && <p className="text-xs text-red-700">Too fast to read comfortably.</p>}
                  {overlap && <p className="text-xs text-red-700">Overlaps the next line.</p>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {!cues && (
        <>
          <FileDrop
            accept={["subtitle"]}
            subtitle="Edit existing subtitles"
            load={loadSubtitles}
            onLoad={([item]) => {
              if (!item) return;
              setName(baseName(item.file.name));
              setFormat(item.result.format);
              setCuesRaw(item.result.cues);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCuesRaw([])}>start from scratch</Button>
            {saved && saved.cues.length > 0 && (
              <Button
                onClick={() => {
                  setName(saved.name);
                  setCuesRaw(saved.cues);
                }}
              >
                continue where you left off ({saved.cues.length} lines)
              </Button>
            )}
          </div>
        </>
      )}
    </ToolLayout>
  );
}
