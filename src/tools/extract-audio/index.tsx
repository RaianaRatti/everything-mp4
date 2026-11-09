import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { FilePickerButton } from "../../components/FileDrop";
import { EngineBadge, EnginePanel } from "../../components/EnginePanel";
import { ExportDialog } from "../../components/ExportDialog";
import { FileActionsContext } from "../../components/FileActions";
import { FileDrop } from "../../components/FileDrop";
import { FilePreview } from "../../components/MediaFiles";
import { MediaPreview } from "../../components/MediaPreview";
import { RangeFields } from "../../components/RangeFields";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Advanced, Button, Field, PanelSection, Select, inputClass } from "../../components/ui";
import { chooseEngine, type EngineChoice } from "../../lib/engine/choose";
import { audioBitrate, sizeFor } from "../../lib/engine/estimate";
import {
  AUDIO_CODECS,
  AUDIO_FORMATS,
  ffmpegMuxer,
  mediabunnyCanWrite,
  type AudioFormat,
} from "../../lib/engine/formats";
import { transcodeInBrowser } from "../../lib/engine/transcode";
import { friendlyMessage } from "../../lib/errors";
import { convertArgs } from "../../lib/ffmpeg/convertArgs";
import { runFfmpeg } from "../../lib/ffmpeg/engine";
import {
  useAbilities,
  useEngineWhenNeeded,
  useMediaLoader,
  type Abilities,
} from "../../lib/ffmpeg/hooks";
import { grabFrame } from "../../lib/gfx/canvas";
import { acceptFor, formatBytes, outputName } from "../../lib/files";
import { toMediaFiles, type MediaFile } from "../../lib/mediaFiles";
import { useObjectUrl } from "../../lib/objectUrl";
import { writeBytes } from "../../lib/output";
import { channelsText } from "../media-info/report";

const BITRATES = [64, 96, 128, 160, 192, 256, 320];

interface Tags {
  title: string;
  artist: string;
  album: string;
}

/** Whether this format can be made here, by the browser or the video engine. */
function makeable(format: AudioFormat, a: Abilities): boolean {
  const codec = AUDIO_CODECS[format.codec];
  const browser =
    mediabunnyCanWrite(format.container) && !!codec.mb && !!a.browserAudio[format.codec];
  const engine =
    !!codec.ff &&
    (!a.engine ||
      (a.engine.encoders.has(codec.ff) && a.engine.muxers.has(ffmpegMuxer(format.container))));
  return browser || engine;
}

export default function ExtractAudio() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [formatId, setFormatId] = useState("mp3");
  const [bitrate, setBitrate] = useState<number | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [channels, setChannels] = useState<number | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [track, setTrack] = useState(1);
  const [tags, setTags] = useState<Tags>({ title: "", artist: "", album: "" });
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abilities = useAbilities();

  const take = (items: Parameters<typeof toMediaFiles>[0]) => {
    const next = toMediaFiles(items)[0];
    if (!next) return;
    setMedia(next);
    setRange({ start: 0, end: next.info.duration });
    setTrack(next.info.audio[0]?.number ?? 1);
    setTags({
      title: next.info.tags.title ?? "",
      artist: next.info.tags.artist ?? "",
      album: next.info.tags.album ?? "",
    });
    setCover(null);
  };
  const loader = useMediaLoader(take);

  const formats = abilities ? AUDIO_FORMATS.filter((f) => makeable(f, abilities)) : AUDIO_FORMATS;
  const format = formats.find((f) => f.id === formatId) ?? formats[0]!;
  const info = media?.info;
  const audio = info?.audio.find((a) => a.number === track) ?? info?.audio[0];
  const duration = info?.duration ?? 0;
  // Ringtones can't be longer than 40 seconds.
  const end = format.maxSeconds ? Math.min(range.end, range.start + format.maxSeconds) : range.end;
  const trimmed = range.start > 0.01 || end < duration - 0.01;
  const changed = (format.lossy && bitrate !== null) || sampleRate !== null || channels !== null;

  const choice: EngineChoice | null =
    info && audio && abilities
      ? chooseEngine({
          browserReads: info.readBy === "browser",
          container: format.container,
          video: null,
          audio: { from: audio.codecId, canDecode: audio.canDecode, to: format.codec, changed },
          browserEncodes: { video: false, audio: !!abilities.browserAudio[format.codec] },
          engine: abilities.engine,
        })
      : null;
  const engineStatus = useEngineWhenNeeded(choice?.engine === "engine");
  const outRate = sampleRate ?? audio?.sampleRate ?? 48_000;
  const outChannels = channels ?? Math.min(2, audio?.channels ?? 2);
  const bits = choice?.copy
    ? (audio?.bitrate ?? 128_000)
    : format.lossy
      ? (bitrate ?? 0) * 1000 || audioBitrate(format.codec, "high", outRate, outChannels)
      : audioBitrate(format.codec, "high", outRate, outChannels);
  const estimate = sizeFor(bits, end - range.start);
  const name = media
    ? outputName(media.file.name, format.id === "m4r" ? "ringtone" : "audio", format.ext)
    : "";
  const canCover = format.tags === "full" && choice?.engine === "browser";

  const sidebar =
    media && info && audio && choice ? (
      <>
        <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
          <PanelSection title="save as">
            <Select
              label="Audio format"
              value={format.id}
              onChange={setFormatId}
              options={formats.map((f) => ({ value: f.id, label: `${f.label}: ${f.description}` }))}
            />
            {format.lossy && (
              <Field label="quality">
                <Select
                  label="Bitrate"
                  value={bitrate === null ? "auto" : String(bitrate)}
                  onChange={(v) => setBitrate(v === "auto" ? null : Number(v))}
                  options={[
                    {
                      value: "auto",
                      label: choice.copy ? "same as the original" : "high (recommended)",
                    },
                    ...BITRATES.map((b) => ({
                      value: String(b),
                      label: `${b} kb/s${b <= 96 ? " (smaller)" : b >= 256 ? " (best)" : ""}`,
                    })),
                  ]}
                />
              </Field>
            )}
          </PanelSection>
          {format.tags !== "none" && (
            <PanelSection title="title and artist">
              {(["title", "artist", "album"] as const).map((key) => (
                <input
                  key={key}
                  value={tags[key]}
                  placeholder={key}
                  aria-label={key}
                  onChange={(e) => setTags((t) => ({ ...t, [key]: e.target.value }))}
                  className={`${inputClass} py-1.5`}
                />
              ))}
              {canCover && (
                <div className="space-y-2">
                  <p className="text-sm">cover art</p>
                  <CoverPicker
                    cover={cover}
                    onCover={setCover}
                    onError={setCoverError}
                    fromFrame={info.video.length && info.canPlay ? () => videoRef.current : null}
                  />
                  {coverError && <p className="text-sm text-red-700">{coverError}</p>}
                </div>
              )}
            </PanelSection>
          )}
          <PanelSection>
            <Advanced>
              {info.audio.length > 1 && (
                <Field label="audio track">
                  <Select
                    label="Audio track"
                    value={String(track)}
                    onChange={(v) => setTrack(Number(v))}
                    options={info.audio.map((a) => ({
                      value: String(a.number),
                      label: `track ${a.number}: ${a.codec}, ${channelsText(a.channels)}${a.language ? ` (${a.language})` : ""}`,
                    }))}
                  />
                </Field>
              )}
              <Field label="sample rate">
                <Select
                  label="Sample rate"
                  value={sampleRate ? String(sampleRate) : "same"}
                  onChange={(v) => setSampleRate(v === "same" ? null : Number(v))}
                  options={[
                    {
                      value: "same",
                      label: `same as the original (${(audio.sampleRate / 1000).toLocaleString()} kHz)`,
                    },
                    { value: "44100", label: "44.1 kHz (CD)" },
                    { value: "48000", label: "48 kHz (video)" },
                  ]}
                />
              </Field>
              <Field label="channels">
                <Select
                  label="Channels"
                  value={channels ? String(channels) : "same"}
                  onChange={(v) => setChannels(v === "same" ? null : Number(v))}
                  options={[
                    {
                      value: "same",
                      label: `same as the original (${channelsText(audio.channels)})`,
                    },
                    { value: "2", label: "stereo" },
                    { value: "1", label: "mono" },
                  ]}
                />
              </Field>
            </Advanced>
          </PanelSection>
        </div>
        <p className="text-sm text-ink-2">about {formatBytes(estimate)}</p>
        <EngineBadge choice={choice} />
        {choice.engine === "engine" && (
          <EnginePanel reason={`Making ${format.label} needs the video engine.`} />
        )}
        <ActionButton
          disabled={!choice.engine || (choice.engine === "engine" && engineStatus !== "ready")}
          onClick={() => setRunning(true)}
        >
          save {format.label}
        </ActionButton>
      </>
    ) : undefined;

  const drop = (
    <FileDrop
      accept={["video", "audio"]}
      compact={!!media}
      title={media ? "use another file" : "drop a video or audio file here"}
      subtitle="Save the sound"
      load={loader.load}
      onLoad={take}
    />
  );

  return (
    <ToolLayout toolId="extract-audio" sidebar={sidebar}>
      <FileActionsContext.Provider value={media ? drop : null}>
      {loader.waiting.length > 0 && (
        <EnginePanel reason={`This browser can't read ${loader.waiting[0]!.name} by itself.`} />
      )}
      {loader.error && <p className="text-sm text-red-700">{loader.error}</p>}
      {media && info && (
        <>
          {info.video.length && info.canPlay ? (
            <PreviewWithRef
              file={media.file}
              mediaRef={videoRef}
              range={{ start: range.start, end }}
            />
          ) : (
            <FilePreview file={media.file} info={info} onRemove={() => setMedia(null)} />
          )}
          {!info.audio.length ? (
            <p className="text-sm text-red-700">This file has no sound to save.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs tracking-wide text-ink-3 uppercase">part to keep</p>
              <RangeFields start={range.start} end={end} duration={duration} onChange={setRange} />
              {format.maxSeconds && range.end - range.start > format.maxSeconds && (
                <p className="text-sm text-ink-2">
                  Ringtones can be at most {format.maxSeconds} seconds, so it stops there.
                </p>
              )}
              {trimmed && choice?.copy && (
                <p className="text-xs text-ink-3">
                  Copied parts start and end on the nearest sound packet, a few milliseconds off.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {!media && drop}

      {running && media && info && audio && choice && (
        <ExportDialog
          running="saving the sound…"
          failed="couldn't save the sound"
          onClose={() => setRunning(false)}
          estimate={{ bytes: estimate, name, mimeType: format.mime }}
          run={async ({ signal, progress, target }) => {
            const trim = trimmed ? { start: range.start, end } : undefined;
            const wantTags =
              format.tags === "none"
                ? {}
                : Object.fromEntries(Object.entries(tags).filter(([, v]) => v.trim()));
            const warnings: string[] = [];
            let blob: Blob;
            if (choice.engine === "browser") {
              const images =
                canCover && cover
                  ? [
                      {
                        data: new Uint8Array(await cover.arrayBuffer()),
                        mimeType: cover.type || "image/jpeg",
                        kind: "coverFront" as const,
                      },
                    ]
                  : undefined;
              const r = await transcodeInBrowser({
                file: media.file,
                container: format.container,
                mime: format.mime,
                video: null,
                audio: {
                  codec: format.codec,
                  bitrate: format.lossy && !choice.copy ? bits : undefined,
                  sampleRate: sampleRate ?? undefined,
                  channels: channels ?? undefined,
                  track,
                },
                trim,
                tags: { ...wantTags, ...(images ? { images } : {}) },
                target,
                signal,
                onProgress: (f) =>
                  progress(f, choice.copy ? "copying the sound…" : "encoding the sound…"),
              });
              warnings.push(...r.warnings);
              blob = r.blob;
            } else {
              const { outputs } = await runFfmpeg({
                inputs: [media.file],
                duration: end - range.start,
                signal,
                onProgress: (f) => progress(f, "encoding the sound…"),
                args: ([input]) =>
                  convertArgs({
                    input: input!,
                    output: `/out/audio.${format.ext}`,
                    container: format.container,
                    video: null,
                    audio: {
                      codec: format.codec,
                      copy: choice.copy,
                      bitrate: format.lossy ? bits : undefined,
                      sampleRate: sampleRate ?? undefined,
                      channels: outChannels,
                      track,
                    },
                    trim,
                    tags: wantTags,
                  }),
              });
              blob = await writeBytes(target, outputs[0]!.data, format.mime);
            }
            return { files: [{ name, blob }], warnings };
          }}
        />
      )}
      </FileActionsContext.Provider>
    </ToolLayout>
  );
}

function PreviewWithRef({
  file,
  mediaRef,
  range,
}: {
  file: File;
  mediaRef: RefObject<HTMLVideoElement | null>;
  range: { start: number; end: number };
}) {
  const url = useObjectUrl(file);
  return url ? <MediaPreview src={url} mediaRef={mediaRef} range={range} /> : null;
}

/** Cover art: taken from the video's current frame or from an image file. */
function CoverPicker({
  cover,
  onCover,
  onError,
  fromFrame,
}: {
  cover: Blob | null;
  onCover: (cover: Blob | null) => void;
  onError: (message: string | null) => void;
  fromFrame: (() => HTMLVideoElement | null) | null;
}) {
  const url = useObjectUrl(cover);
  return (
    <div className="flex items-center gap-3">
      {url ? (
        <img
          src={url}
          alt="Cover art"
          className="size-16 rounded-sm border-2 border-ink object-cover"
        />
      ) : (
        <div className="flex size-16 items-center justify-center rounded-sm border-2 border-dashed border-ink-3 text-ink-3">
          <ImagePlus className="size-5" aria-hidden />
        </div>
      )}
      <div className="flex flex-col items-start gap-1">
        {fromFrame && (
          <Button
            variant="ghost"
            className="px-1 py-0.5"
            onClick={() => {
              const video = fromFrame();
              if (!video) return;
              grabFrame(video, "image/jpeg").then(
                (blob) => {
                  onError(null);
                  onCover(blob);
                },
                (err: unknown) => onError(friendlyMessage(err, "Couldn't grab the frame.")),
              );
            }}
          >
            use the current frame
          </Button>
        )}
        <FilePickerButton
          accept={acceptFor(["image"])}
          onFiles={([file]) => file && onCover(file)}
          bare
          className="rounded-md px-1 py-0.5 text-sm hover:bg-accent"
        >
          choose an image
        </FilePickerButton>
        {cover && (
          <button
            type="button"
            onClick={() => onCover(null)}
            className="flex items-center gap-1 px-1 text-xs text-ink-3 hover:text-ink"
          >
            <Trash2 className="size-3" aria-hidden /> remove
          </button>
        )}
      </div>
    </div>
  );
}
