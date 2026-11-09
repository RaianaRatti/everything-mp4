import { useState } from "react";
import { useNavigate } from "react-router";
import { EnginePanel } from "../../components/EnginePanel";
import { Player, usePlayer } from "../../components/EnginePage";
import { ExportDialog } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { OpenIn } from "../../components/OpenIn";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Button, Checkbox, Field, PanelSection, Segmented, Select } from "../../components/ui";
import { FriendlyError } from "../../lib/errors";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { useMediaLoader } from "../../lib/ffmpeg/hooks";
import { baseName, downloadBlob } from "../../lib/files";
import { handOff } from "../../lib/handoff";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { subtitleFile, wordsToCues, type Cue } from "../../lib/subtitles/format";
import { formatTime } from "../../lib/time";
import type { WhisperMessage, WhisperRequest } from "../../workers/whisper";

type Size = WhisperRequest["size"];

const SIZES: { value: Size; label: string; mb: number }[] = [
  { value: "tiny", label: "tiny (fastest)", mb: 40 },
  { value: "base", label: "base (balanced)", mb: 80 },
  { value: "small", label: "small (most accurate)", mb: 250 },
];

const LANGUAGES = [
  ["", "detect automatically"],
  ["english", "English"],
  ["spanish", "Spanish"],
  ["portuguese", "Portuguese"],
  ["french", "French"],
  ["german", "German"],
  ["italian", "Italian"],
  ["dutch", "Dutch"],
  ["japanese", "Japanese"],
  ["korean", "Korean"],
  ["chinese", "Chinese"],
  ["arabic", "Arabic"],
  ["hindi", "Hindi"],
  ["russian", "Russian"],
  ["turkish", "Turkish"],
  ["polish", "Polish"],
] as const;

/** The file's sound as 16 kHz mono samples, which is what Whisper takes. */
async function audio16k(file: File, duration: number, signal: AbortSignal): Promise<Float32Array> {
  try {
    const ctx = new OfflineAudioContext(1, 16000, 16000);
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const out = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i++) out[i]! += data[i]! / decoded.numberOfChannels;
    }
    return out;
  } catch {
    if (useEngine.getState().status !== "ready")
      throw new FriendlyError("Load the video engine (below) to read this file's sound, then try again.");
    const { outputs } = await runFfmpeg({
      inputs: [file],
      duration,
      signal,
      args: ([input]) => ["-i", input!, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "/out/a.raw"],
    });
    const data = outputs[0]!.data;
    return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  }
}

function transcribe(
  request: WhisperRequest,
  signal: AbortSignal,
  progress: (fraction: number, label: string) => void,
): Promise<Cue[]> {
  const worker = new Worker(new URL("../../workers/whisper.ts", import.meta.url), { type: "module" });
  const files = new Map<string, { loaded: number; total: number }>();
  return new Promise<Cue[]>((resolve, reject) => {
    signal.addEventListener("abort", () => {
      worker.terminate();
      reject(signal.reason);
    });
    worker.onmessage = (e: MessageEvent<WhisperMessage>) => {
      const m = e.data;
      if (m.type === "download") {
        files.set(m.file, { loaded: m.loaded, total: m.total });
        const all = [...files.values()];
        const total = all.reduce((s, f) => s + f.total, 0);
        progress(total ? all.reduce((s, f) => s + f.loaded, 0) / total : 0, "downloading the speech model…");
      } else if (m.type === "progress") progress(m.fraction, "transcribing…");
      else if (m.type === "error") {
        worker.terminate();
        reject(new FriendlyError(`Couldn't transcribe: ${m.message}`));
      } else {
        worker.terminate();
        resolve(m.words ? wordsToCues(m.words) : m.segments);
      }
    };
    worker.postMessage(request, [request.audio.buffer]);
  });
}

export default function AutoCaptions() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [size, setSize] = useState<Size>("base");
  const [language, setLanguage] = useState("");
  const [translate, setTranslate] = useState(false);
  const [running, setRunning] = useState(false);
  const [cues, setCues] = useState<Cue[] | null>(null);
  const engineReady = useEngine((s) => s.status === "ready");
  const navigate = useNavigate();
  const player = usePlayer();
  const take = (items: Parameters<typeof toMediaFiles>[0]) => {
    const next = toMediaFiles(items)[0];
    if (!next) return;
    setMedia(next);
    setCues(null);
  };
  const loader = useMediaLoader(take);
  const model = SIZES.find((s) => s.value === size)!;
  const base = media ? baseName(media.file.name) : "captions";

  const send = (to: string) => {
    if (!media || !cues) return;
    handOff([media.file, subtitleFile(cues, "srt", base)], cues);
    navigate(`/${to}`);
  };

  const sidebar = media ? (
    <>
      <div className="divide-y-3 divide-ink rounded-lg border-3 border-ink bg-card">
        <PanelSection title="auto captions">
          <Field label="model">
            <Segmented
              label="Model"
              value={size}
              onChange={setSize}
              options={SIZES.map((s) => ({ value: s.value, label: s.value }))}
            />
          </Field>
          <p className="text-xs text-ink-3">
            {model.label}. The first time, the {size} model (about {model.mb} MB) is downloaded and
            then kept for next time.
          </p>
          <Field label="language">
            <Select
              label="Language"
              value={language}
              onChange={setLanguage}
              options={LANGUAGES.map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Checkbox checked={translate} onChange={setTranslate} label="translate to English" />
        </PanelSection>
      </div>
      <ActionButton onClick={() => setRunning(true)}>
        {cues ? "transcribe again" : `transcribe (${model.mb} MB model)`}
      </ActionButton>
    </>
  ) : undefined;

  const drop = (
    <FileDrop
      accept={["video", "audio"]}
      compact={!!media}
      subtitle="Turn speech into subtitles or a downloadable transcript"
      load={loader.load}
      onLoad={take}
    />
  );

  return (
    <ToolLayout toolId="auto-captions" sidebar={sidebar}>
      <FileActionsContext.Provider value={media ? drop : null}>
      {loader.waiting.length > 0 && (
        <EnginePanel reason={`Reading ${loader.waiting[0]!.name} uses the video engine.`} />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
      {media && !engineReady && !media.info.canPlay && (
        <EnginePanel reason="Reading this file's sound uses the video engine." />
      )}
      {cues && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["srt", "vtt", "txt"] as const).map((f) => (
              <Button
                key={f}
                onClick={() => {
                  const file = subtitleFile(cues, f, base);
                  downloadBlob(file, file.name);
                }}
              >
                download {f.toUpperCase()}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => send("subtitle-editor")}>
              edit
            </Button>
            {media?.info.video.length ? (
              <Button variant="primary" onClick={() => send("add-subtitles")}>
                burn in or add as subtitles
              </Button>
            ) : null}
            <OpenIn
              file={subtitleFile(cues, "srt", base)}
              also={media ? [media.file] : []}
              cues={cues}
              exclude="auto-captions"
            />
          </div>
          <ol className="max-h-[50vh] space-y-1 overflow-y-auto rounded-md border-3 border-ink bg-card p-2">
            {cues.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => player.seek(c.start)}
                  className="flex w-full gap-3 rounded px-1 py-0.5 text-left text-sm hover:bg-accent"
                >
                  <span className="shrink-0 text-ink-3">{formatTime(c.start, 0)}</span>
                  {c.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!media && drop}
      {running && media && (
        <ExportDialog
          running="making captions…"
          failed="couldn't make captions"
          onClose={() => setRunning(false)}
          renderResult={() => null}
          run={async ({ signal, progress }) => {
            progress(0, "reading the sound…");
            const audio = await audio16k(media.file, media.info.duration, signal);
            const result = await transcribe(
              { size, language: language || null, translate, audio },
              signal,
              progress,
            );
            setCues(result);
            return {
              files: [{ name: `${base}.srt`, blob: subtitleFile(result, "srt", base) }],
              notes: [`${result.length} lines. Close this to see the transcript and more options.`],
            };
          }}
        />
      )}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}
