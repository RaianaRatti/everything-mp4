import { BookOpen, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EnginePage, Player, usePlayer, type EngineJob } from "../../components/EnginePage";
import { FilePickerButton } from "../../components/FileDrop";
import { Button, Checkbox, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import { canvasToBlob } from "../../lib/gfx/canvas";
import { ENCODE_MP4, safeBase } from "../../lib/ffmpeg/edit";
import { acceptFor, outputName } from "../../lib/files";
import { takeHandoff, useHandoff } from "../../lib/handoff";
import type { MediaFile } from "../../lib/mediaFiles";
import { FONTS, layerPng, type TextLayer } from "../../lib/overlays/layers";
import { estimateWords, loadSubtitles, subtitleFile, type Cue } from "../../lib/subtitles/format";

type Mode = "soft" | "burn" | "social" | "extract";
type Container = "mp4" | "mkv" | "webm";

interface Track {
  id: number;
  name: string;
  cues: Cue[];
  language: string;
}

const LANGUAGES = [
  ["eng", "English"],
  ["spa", "Spanish"],
  ["por", "Portuguese"],
  ["fra", "French"],
  ["deu", "German"],
  ["ita", "Italian"],
  ["nld", "Dutch"],
  ["jpn", "Japanese"],
  ["kor", "Korean"],
  ["zho", "Chinese"],
  ["ara", "Arabic"],
  ["hin", "Hindi"],
  ["rus", "Russian"],
  ["und", "other"],
] as const;

let nextId = 1;

/** What each way of adding subtitles means, shown from the dictionary button. */
const GLOSSARY: [term: string, meaning: string][] = [
  ["soft", "Viewers can turn them on and off in their player. Instant: the video isn't re-encoded."],
  ["burned in", "Drawn into the picture, so they're always visible, in any player or app."],
  ["social style", "Burned in a few words at a time, with the word being said highlighted."],
  ["extract", "Saves the subtitles already inside this video as SRT files."],
];

interface Style {
  font: string;
  size: number;
  color: string;
  highlight: string;
  outline: number;
  box: boolean;
  y: number;
  words: number;
}

/** One frame-size PNG per shown state, plus a concat list that times them over the video. */
async function burnFrames(
  cues: Cue[],
  style: Style,
  social: boolean,
  w: number,
  h: number,
  duration: number,
): Promise<{ pngs: File[]; list: (firstIndex: number) => File }> {
  const states: { start: number; end: number; draw: () => Promise<File> }[] = [];
  let id = 0;
  if (!social) {
    for (const c of cues) {
      const layer: TextLayer = {
        id: id++,
        kind: "text",
        text: c.text,
        font: style.font,
        size: style.size,
        color: style.color,
        outline: style.outline,
        outlineColor: "#000000",
        shadow: !style.box,
        box: style.box,
        boxColor: "#000000aa",
        align: "center",
        wrap: 90,
        x: 50,
        y: style.y,
        rotation: 0,
        opacity: 1,
        start: c.start,
        end: c.end,
        anim: "none",
      };
      states.push({ start: c.start, end: c.end, draw: () => layerPng(layer, w, h) });
    }
  } else {
    for (const c of cues) {
      const words = estimateWords(c);
      for (let g = 0; g < words.length; g += style.words) {
        const group = words.slice(g, g + style.words);
        group.forEach((word, k) => {
          const n = id++;
          const end = group[k + 1]?.start ?? words[g + style.words]?.start ?? word.end;
          states.push({
            start: word.start,
            end: Math.max(end, word.end),
            draw: () => socialPng(group.map((x) => x.text), k, style, w, h, n),
          });
        });
      }
    }
  }
  states.sort((a, b) => a.start - b.start);
  const blank = document.createElement("canvas");
  blank.width = w;
  blank.height = h;
  const blankFile = new File([await canvasToBlob(blank)], "blank.png", { type: "image/png" });
  const pngs = [blankFile, ...(await Promise.all(states.map((s) => s.draw())))];
  // Inputs are named <index>.png by the engine, in the order given, next to this list.
  const list = (first: number) => {
    const lines = ["ffconcat version 1.0"];
    let at = 0;
    const entry = (index: number, length: number) => {
      if (length <= 0.001) return;
      lines.push(`file '${first + index}.png'`, `duration ${length.toFixed(3)}`);
    };
    states.forEach((s, i) => {
      entry(0, s.start - at);
      const end = Math.min(s.end, states[i + 1]?.start ?? s.end);
      entry(i + 1, end - Math.max(at, s.start));
      at = Math.max(at, end);
    });
    entry(0, duration - at);
    lines.push(`file '${first}.png'`);
    return new File([lines.join("\n")], "list.txt", { type: "text/plain" });
  };
  return { pngs, list };
}

async function socialPng(words: string[], current: number, style: Style, w: number, h: number, id: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  await document.fonts.load(`700 20px ${style.font}`).catch(() => {});
  const px = (style.size / 100) * h * 1.3;
  ctx.font = `700 ${px}px ${style.font}`;
  ctx.textBaseline = "middle";
  const text = words.map((x) => x.toUpperCase());
  const space = ctx.measureText(" ").width;
  const widths = text.map((x) => ctx.measureText(x).width);
  let x = w / 2 - (widths.reduce((a, b) => a + b, 0) + space * (text.length - 1)) / 2;
  const y = (style.y / 100) * h;
  text.forEach((word, i) => {
    ctx.lineJoin = "round";
    ctx.lineWidth = px * 0.16;
    ctx.strokeStyle = "black";
    ctx.strokeText(word, x, y);
    ctx.fillStyle = i === current ? style.highlight : style.color;
    ctx.fillText(word, x, y);
    x += widths[i]! + space;
  });
  return new File([await canvasToBlob(canvas)], `s${id}.png`, { type: "image/png" });
}

export default function AddSubtitles() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mode, setMode] = useState<Mode>("soft");
  const [glossary, setGlossary] = useState(false);
  const [container, setContainer] = useState<Container>("mp4");
  const [style, setStyle] = useState<Style>({
    font: FONTS[1]!.value,
    size: 5,
    color: "#ffffff",
    highlight: "#ffd400",
    outline: 10,
    box: false,
    y: 85,
    words: 2,
  });
  const player = usePlayer();

  /** One subtitle file at a time: a new one replaces the old. */
  const addFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const r = await loadSubtitles(f);
    setTracks([{ id: nextId++, name: f.name, cues: r.cues, language: "eng" }]);
  };

  // Subtitles sent from auto captions; their word timings drive the social style.
  useEffect(() => {
    const files = takeHandoff(["subtitle"]);
    const cues = useHandoff.getState().cues;
    if (!files.length) return;
    void Promise.resolve().then(() => {
      if (cues) {
        setTracks([{ id: nextId++, name: files[0]!.name, cues, language: "und" }]);
        useHandoff.setState({ cues: null });
      } else void addFiles(files);
    });
  }, []);

  const track = tracks[0];
  const info = media?.info;
  const video = info?.video[0];
  const duration = info?.duration ?? 0;
  const s = (p: Partial<Style>) => setStyle({ ...style, ...p });

  const jobs = async (): Promise<EngineJob[]> => {
    const m = media!;
    if (mode === "extract") {
      return [
        {
          duration,
          mime: "application/x-subrip",
          args: ([input]) => [
            "-i",
            input!,
            ...m.info.subtitles.flatMap((t, i) => [
              "-map",
              `0:s:${i}`,
              "-c:s",
              "srt",
              `/out/${safeBase(m.file)}.${i + 1}${t.language ? `.${t.language}` : ""}.srt`,
            ]),
          ],
        },
      ];
    }
    if (mode === "soft") {
      const fmt = container === "webm" ? "vtt" : "srt";
      const files = tracks.map((t, i) => subtitleFile(t.cues, fmt, `sub${i}`));
      const codec = container === "mp4" ? "mov_text" : container === "webm" ? "webvtt" : "srt";
      return [
        {
          duration,
          mime: container === "mp4" ? "video/mp4" : container === "webm" ? "video/webm" : "video/x-matroska",
          name: outputName(m.file.name, "subtitled", container),
          extraInputs: files,
          args: ([input, ...subs]) => [
            "-i",
            input!,
            ...subs.flatMap((p) => ["-i", p]),
            "-map",
            "0:v",
            "-map",
            "0:a?",
            ...subs.flatMap((_, i) => ["-map", `${i + 1}:0`]),
            "-c",
            "copy",
            "-c:s",
            codec,
            ...tracks.flatMap((t, i) => [
              `-metadata:s:s:${i}`,
              `language=${t.language}`,
              `-disposition:s:${i}`,
              i === 0 ? "default" : "0",
            ]),
            `/out/subtitled.${container}`,
          ],
        },
      ];
    }
    const { pngs, list } = await burnFrames(
      track?.cues ?? [],
      style,
      mode === "social",
      video!.width,
      video!.height,
      duration,
    );
    return [
      {
        duration,
        mime: "video/mp4",
        name: outputName(m.file.name, "subtitled", "mp4"),
        extraInputs: [...pngs, list(1)],
        args: (inputs) => [
          "-i",
          inputs[0]!,
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          inputs[inputs.length - 1]!,
          "-filter_complex",
          "[1:v]format=rgba[s];[0:v][s]overlay=0:0:eof_action=pass[v]",
          "-map",
          "[v]",
          "-map",
          "0:a:0?",
          ...ENCODE_MP4,
          "/out/subtitled.mp4",
        ],
      },
    ];
  };

  const settings = media && (
    <>
      <PanelSection>
        <div className="flex items-center justify-between">
          <p className="text-xs tracking-wide text-ink-3 uppercase">add subtitles</p>
          <button
            type="button"
            aria-expanded={glossary}
            aria-label="What do these mean?"
            title="What do these mean?"
            onClick={() => setGlossary(!glossary)}
            className={`rounded-md p-1 hover:bg-accent ${glossary ? "bg-accent" : ""}`}
          >
            <BookOpen className="size-4" />
          </button>
        </div>
        {glossary && (
          <dl className="space-y-3 rounded-md border-2 border-ink bg-paper-2 p-3 text-sm">
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term} className="space-y-0.5">
                <dt className="text-base font-semibold text-ink">{term}</dt>
                <dd className="leading-relaxed text-ink-2">{meaning}</dd>
              </div>
            ))}
          </dl>
        )}
        <Select
          label="How"
          value={mode}
          onChange={setMode}
          options={[
            { value: "soft", label: "soft" },
            { value: "burn", label: "burned in" },
            { value: "social", label: "social style" },
            { value: "extract", label: "extract" },
          ]}
        />
        {mode === "soft" && (
          <>
            {track && (
              <Field label="language">
                <select
                  value={track.language}
                  onChange={(e) => setTracks([{ ...track, language: e.target.value }])}
                  className={inputClass}
                  aria-label="Language"
                >
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="save as">
              <Segmented
                label="Container"
                value={container}
                onChange={setContainer}
                options={[
                  { value: "mp4", label: "MP4" },
                  { value: "mkv", label: "MKV" },
                  { value: "webm", label: "WebM" },
                ]}
              />
            </Field>
          </>
        )}
        {mode === "extract" && (
          <p className="text-sm">
            {info?.subtitles.length
              ? `${info.subtitles.length} subtitle tracks found. Each is saved as SRT.`
              : "This video has no subtitles inside it."}
          </p>
        )}
      </PanelSection>
      {(mode === "burn" || mode === "social") && (
        <PanelSection title="style">
          <Field label="font">
            <Select label="Font" value={style.font} onChange={(font) => s({ font })} options={FONTS} />
          </Field>
          <Field label={`size: ${style.size}`}>
            <input
              type="range"
              min={2}
              max={12}
              step={0.5}
              value={style.size}
              onChange={(e) => s({ size: Number(e.target.value) })}
              className="w-full accent-black"
              aria-label="Size"
            />
          </Field>
          <Field label={`position: ${style.y}% from the top`}>
            <input
              type="range"
              min={5}
              max={95}
              value={style.y}
              onChange={(e) => s({ y: Number(e.target.value) })}
              className="w-full accent-black"
              aria-label="Position"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              color
              <input type="color" value={style.color} onChange={(e) => s({ color: e.target.value })} />
            </label>
            {mode === "social" && (
              <label className="flex items-center gap-1">
                current word
                <input type="color" value={style.highlight} onChange={(e) => s({ highlight: e.target.value })} />
              </label>
            )}
            {mode === "burn" && <Checkbox checked={style.box} onChange={(box) => s({ box })} label="box" />}
          </div>
          {mode === "burn" && (
            <Field label={`outline: ${style.outline}`}>
              <input
                type="range"
                min={0}
                max={30}
                value={style.outline}
                onChange={(e) => s({ outline: Number(e.target.value) })}
                className="w-full accent-black"
                aria-label="Outline"
              />
            </Field>
          )}
          {mode === "social" && (
            <Field label="words at a time">
              <Segmented
                label="Words at a time"
                value={String(style.words)}
                onChange={(v) => s({ words: Number(v) })}
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                ]}
              />
            </Field>
          )}
        </PanelSection>
      )}
    </>
  );

  return (
    <EnginePage
      toolId="add-subtitles"
      subtitle="Add subtitles to video"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      before={
        media &&
        mode !== "extract" && (
          <PanelSection title="subtitle file">
            {track && (
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={track.name}>
                  {track.name} · {track.cues.length} lines
                </span>
                <Button variant="ghost" aria-label="Remove subtitle file" onClick={() => setTracks([])}>
                  <X className="size-4" />
                </Button>
              </div>
            )}
            <FilePickerButton
              accept={acceptFor(["subtitle"])}
              onFiles={(files) => void addFiles(files)}
              className="w-full"
            >
              {track ? (
                "replace subtitle file"
              ) : (
                <>
                  <Plus className="size-4" aria-hidden />
                  add subtitle file
                </>
              )}
            </FilePickerButton>
          </PanelSection>
        )
      }
      settings={settings}
      action={mode === "extract" ? "extract" : "add subtitles"}
      running={mode === "extract" ? "extracting…" : "adding subtitles…"}
      disabled={
        (!video && "This file has no video.") ||
        (mode === "extract" ? !info?.subtitles.length && "Nothing to extract." : !track && "Add a subtitle file first.")
      }
      jobs={jobs}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
    </EnginePage>
  );
}
