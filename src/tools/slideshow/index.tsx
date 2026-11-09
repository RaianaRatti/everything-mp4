import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { EnginePanel } from "../../components/EnginePanel";
import { ExportDialog } from "../../components/ExportDialog";
import { FileDrop, FilePickerButton } from "../../components/FileDrop";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Button, Checkbox, Field, PanelSection, Segmented, Select, inputClass } from "../../components/ui";
import { inspectMedia } from "../../lib/engine/inspect";
import { ENCODE_MP4 } from "../../lib/ffmpeg/edit";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { useEngineWhenNeeded } from "../../lib/ffmpeg/hooks";
import { canvasToBlob } from "../../lib/gfx/canvas";
import { acceptFor } from "../../lib/files";
import { formatTime } from "../../lib/time";

interface Slide {
  id: number;
  file: File;
  image: ImageBitmap;
  url: string;
  /** Null: use the default length. */
  seconds: number | null;
  caption: string;
}

type Fit = "blur" | "bars" | "fill";
type Transition = "none" | "fade" | "fadeblack" | "wipeleft" | "slideleft";

const SHAPES = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};
type Shape = keyof typeof SHAPES;

const FPS = 30;
let nextId = 1;

/** Draws one slide (fitted, with its caption) at the output size. */
async function renderSlide(s: Slide, w: number, h: number, fit: Fit): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = s.image;
  const contain = Math.min(w / img.width, h / img.height);
  const cover = Math.max(w / img.width, h / img.height);
  const draw = (scale: number) =>
    ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);
  if (fit === "blur") {
    ctx.filter = `blur(${Math.round(w / 40)}px) brightness(0.8)`;
    draw(cover * 1.1);
    ctx.filter = "none";
  }
  draw(fit === "fill" ? cover : contain);
  if (s.caption) {
    const px = Math.round(h * 0.05);
    ctx.font = `600 ${px}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(s.caption).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(w / 2 - tw / 2 - px * 0.4, h * 0.88 - px * 0.7, tw + px * 0.8, px * 1.4);
    ctx.fillStyle = "white";
    ctx.fillText(s.caption, w / 2, h * 0.88);
  }
  return new File([await canvasToBlob(canvas, "image/jpeg", 0.92)], `slide${s.id}.jpg`, {
    type: "image/jpeg",
  });
}

export default function Slideshow() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [seconds, setSeconds] = useState(3);
  const [fit, setFit] = useState<Fit>("blur");
  const [zoom, setZoom] = useState(true);
  const [transition, setTransition] = useState<Transition>("fade");
  // Seconds each transition takes.
  const fade = 0.8;
  const [shape, setShape] = useState<Shape>("16:9");
  const [music, setMusic] = useState<{ file: File; duration: number } | null>(null);
  const [fitMusic, setFitMusic] = useState(false);
  const [running, setRunning] = useState(false);
  const status = useEngineWhenNeeded(slides.length > 0);
  const ready = useEngine((s) => s.status === "ready");

  const n = slides.length;
  const d = transition === "none" || n < 2 ? 0 : fade;
  // Fitting to the music spreads its length evenly over the slides.
  const lengths =
    fitMusic && music && n
      ? slides.map(() => (music.duration + (n - 1) * d) / n)
      : slides.map((s) => s.seconds ?? seconds);
  const total = lengths.reduce((a, b) => a + b, 0) - d * Math.max(0, n - 1);
  const { width: W, height: H } = SHAPES[shape];

  const sortBy = (by: "name" | "date") =>
    setSlides(
      [...slides].sort((a, b) =>
        by === "name"
          ? a.file.name.localeCompare(b.file.name, undefined, { numeric: true })
          : a.file.lastModified - b.file.lastModified,
      ),
    );
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= n) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSlides(next);
  };
  const patch = (i: number, p: Partial<Slide>) =>
    setSlides(slides.map((s, k) => (k === i ? { ...s, ...p } : s)));

  const sidebar = n ? (
    <>
      <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
        <PanelSection title="slideshow">
          <Segmented
            label="Shape"
            value={shape}
            onChange={setShape}
            options={[
              { value: "16:9", label: "16:9" },
              { value: "9:16", label: "9:16" },
              { value: "1:1", label: "1:1" },
            ]}
          />
          <Field label="seconds per slide">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={seconds}
              disabled={fitMusic}
              onChange={(e) => Number(e.target.value) > 0 && setSeconds(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="fit">
            <Select
              label="Fit"
              value={fit}
              onChange={setFit}
              options={[
                { value: "blur", label: "blurred background" },
                { value: "bars", label: "black bars" },
                { value: "fill", label: "fill (crop the edges)" },
              ]}
            />
          </Field>
          <Checkbox checked={zoom} onChange={setZoom} label="gentle zoom" />
          <Field label="transition">
            <Select
              label="Transition"
              value={transition}
              onChange={setTransition}
              options={[
                { value: "none", label: "none" },
                { value: "fade", label: "crossfade" },
                { value: "fadeblack", label: "fade through black" },
                { value: "wipeleft", label: "wipe" },
                { value: "slideleft", label: "slide" },
              ]}
            />
          </Field>
        </PanelSection>
        <PanelSection title="music">
          <FilePickerButton
            accept={acceptFor(["audio"])}
            onFiles={(files) => {
              const file = files[0];
              if (!file) return;
              void inspectMedia(file)
                .then((info) => setMusic({ file, duration: info.duration }))
                .catch(() => setMusic({ file, duration: 0 }));
            }}
          >
            {music ? "change music" : "add music"}
          </FilePickerButton>
          {music && (
            <>
              <p className="truncate text-xs text-ink-3">{music.file.name}</p>
              {music.duration > 0 && (
                <Checkbox
                  checked={fitMusic}
                  onChange={setFitMusic}
                  label={`fit the slides to the music (${formatTime(music.duration, 0)})`}
                />
              )}
              <Button variant="ghost" onClick={() => setMusic(null)}>
                remove music
              </Button>
            </>
          )}
        </PanelSection>
      </div>
      <p className="text-sm">
        {n} slides · {formatTime(total)}
      </p>
      {!ready && <EnginePanel reason="Making slideshows uses the video engine." />}
      <ActionButton disabled={status !== "ready" || !n} onClick={() => setRunning(true)}>
        make slideshow
      </ActionButton>
    </>
  ) : undefined;

  const drop = (
    <FileDrop
      accept={["image"]}
      multiple
      compact={n > 0}
      subtitle="Drop photos to turn into a video"
      load={(file) => createImageBitmap(file)}
      onLoad={(items) =>
        setSlides((prev) => [
          ...prev,
          ...items.map(({ file, result }) => ({
            id: nextId++,
            file,
            image: result,
            url: URL.createObjectURL(file),
            seconds: null,
            caption: "",
          })),
        ])
      }
    />
  );

  return (
    <ToolLayout toolId="slideshow" sidebar={sidebar}>
      {n > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            sort by
            <button type="button" className="underline" onClick={() => sortBy("name")}>
              name
            </button>
            <button type="button" className="underline" onClick={() => sortBy("date")}>
              date
            </button>
            <span className="ml-auto">{drop}</span>
          </div>
          <ol className="space-y-2">
            {slides.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border-2 border-ink bg-card p-2">
                <img src={s.url} alt="" className="size-16 shrink-0 rounded-sm object-cover" />
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    value={s.caption}
                    placeholder="caption (optional)"
                    onChange={(e) => patch(i, { caption: e.target.value })}
                    className={`${inputClass} py-1`}
                    aria-label={`Caption for slide ${i + 1}`}
                  />
                  <label className="flex items-center gap-1 text-xs text-ink-2">
                    seconds
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={s.seconds ?? seconds}
                      disabled={fitMusic}
                      onChange={(e) => patch(i, { seconds: Number(e.target.value) || null })}
                      className={`${inputClass} w-20 py-0.5`}
                    />
                  </label>
                </div>
                <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" aria-label="Move down" disabled={i === n - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => {
                    URL.revokeObjectURL(s.url);
                    setSlides(slides.filter((_, k) => k !== i));
                  }}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}
      {!n && drop}

      {running && (
        <ExportDialog
          running="making the slideshow…"
          failed="couldn't make it"
          onClose={() => setRunning(false)}
          run={async ({ signal, progress }) => {
            progress(0, "drawing slides…");
            const files = await Promise.all(slides.map((s) => renderSlide(s, W, H, fit)));
            const parts: string[] = [];
            lengths.forEach((len, i) => {
              const frames = Math.round(len * FPS);
              const z = zoom ? `'min(1+${(0.12 / frames).toFixed(6)}*on,1.12)'` : "1";
              parts.push(
                `[${i}:v]zoompan=z=${z}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p,settb=AVTB,setsar=1[v${i}]`,
              );
            });
            if (d === 0) {
              parts.push(`${slides.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[v]`);
            } else {
              let cur = "v0";
              let offset = 0;
              for (let i = 1; i < n; i++) {
                offset += lengths[i - 1]! - d;
                const out = i === n - 1 ? "v" : `x${i}`;
                parts.push(`[${cur}][v${i}]xfade=transition=${transition}:duration=${d}:offset=${offset.toFixed(3)}[${out}]`);
                cur = out;
              }
            }
            if (music) {
              const fadeOut = Math.min(2, total / 4);
              parts.push(
                `[${n}:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,afade=in:d=1,afade=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut}[a]`,
              );
            }
            const { outputs } = await runFfmpeg({
              inputs: [...files, ...(music ? [music.file] : [])],
              duration: total,
              signal,
              onProgress: (f) => progress(f, "making the video…"),
              args: (inputs) => [
                ...inputs.slice(0, n).flatMap((p) => ["-i", p]),
                ...(music ? ["-stream_loop", "-1", "-i", inputs[n]!] : []),
                "-filter_complex",
                parts.join(";"),
                "-map",
                "[v]",
                ...(music ? ["-map", "[a]"] : []),
                ...ENCODE_MP4,
                "-t",
                total.toFixed(3),
                "/out/slideshow.mp4",
              ],
            });
            return {
              files: [{ name: "slideshow.mp4", blob: new Blob([outputs[0]!.data], { type: "video/mp4" }) }],
            };
          }}
        />
      )}
    </ToolLayout>
  );
}
