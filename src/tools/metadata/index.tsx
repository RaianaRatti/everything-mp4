import { MapPin, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { FilePickerButton } from "../../components/FileDrop";
import { Button, Checkbox, PanelSection, Select, inputClass } from "../../components/ui";
import { mimeFor, sameExtension } from "../../lib/ffmpeg/edit";
import { runFfmpeg, useEngine } from "../../lib/ffmpeg/engine";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

interface Tag {
  key: string;
  value: string;
}

const COMMON = ["title", "artist", "album", "comment", "description", "date", "creation_time", "genre"];

const isLocation = (k: string) => /location|gps|iso6709|xyz/i.test(k);
const isDevice = (k: string) => /make|model|manufacturer|software|encoder/i.test(k);

/** Reads the file's global tags with ffmpeg, using the same names ffmpeg writes them back with. */
async function readTags(file: File): Promise<Tag[]> {
  const { outputs } = await runFfmpeg({
    inputs: [file],
    args: ([input]) => ["-i", input!, "-f", "ffmetadata", "/out/meta.txt"],
  });
  const text = new TextDecoder().decode(outputs[0]!.data);
  const tags: Tag[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("[")) break; // Stream and chapter sections follow the global tags.
    if (line.startsWith(";") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    tags.push({ key: line.slice(0, i), value: line.slice(i + 1).replace(/\\(.)/g, "$1") });
  }
  return tags;
}

export default function Metadata() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [stripAll, setStripAll] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useEngine((s) => s.status === "ready");
  const player = usePlayer();

  useEffect(() => {
    if (!media || !ready) return;
    let live = true;
    void readTags(media.file).then(
      (t) => live && setTags(t),
      () => live && setError("Couldn't read this file's details."),
    );
    return () => {
      live = false;
    };
  }, [media, ready]);

  const info = media?.info;
  const ext = media ? sameExtension(media) : "mp4";
  const audioOnly = !!info && !info.video.length;
  const list = tags ?? [];
  const set = (i: number, value: string) =>
    setTags(list.map((t, k) => (k === i ? { ...t, value } : t)));
  const missing = COMMON.filter((k) => !list.some((t) => t.key === k));

  const row = (t: Tag, i: number) => (
    <div key={t.key} className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-xs text-ink-2" title={t.key}>
        {t.key}
      </span>
      <input
        value={t.value}
        onChange={(e) => set(i, e.target.value)}
        className={`${inputClass} py-1`}
        aria-label={t.key}
      />
      <Button variant="ghost" aria-label={`Remove ${t.key}`} onClick={() => setTags(list.filter((_, k) => k !== i))}>
        <X className="size-4" />
      </Button>
    </div>
  );

  const location = list.filter((t) => isLocation(t.key));
  const device = list.filter((t) => isDevice(t.key));

  const settings = media && (
    <PanelSection title="privacy">
      <Checkbox checked={stripAll} onChange={setStripAll} label="remove all metadata" />
      <p className="text-xs text-ink-3">
        Removes every detail (location, camera, dates, titles) without re-encoding: quick, no
        quality loss.
      </p>
      {audioOnly && (
        <>
          <FilePickerButton accept="image/png,image/jpeg" onFiles={(f) => f[0] && setCover(f[0])}>
            {cover ? `cover: ${cover.name}` : "replace cover art"}
          </FilePickerButton>
          {info?.hasCoverArt && (
            <Checkbox checked={removeCover} onChange={setRemoveCover} label="remove cover art" />
          )}
        </>
      )}
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="metadata"
      subtitle="See and edit a file's metadata"
      accept={["video", "audio"]}
      media={media ? [media] : []}
      onMedia={(files) => {
        if (!files[0]) return;
        setMedia(files[0]);
        setTags(null);
        setError(null);
        setCover(null);
      }}
      settings={settings}
      action="save"
      running="saving…"
      disabled={!stripAll && !tags && "Reading the details…"}
      jobs={() => [
        {
          duration: info!.duration,
          mime: audioOnly ? (media!.file.type || "audio/mpeg") : mimeFor(ext),
          name: outputName(media!.file.name, stripAll ? "clean" : "edited", ext),
          extraInputs: cover && !stripAll ? [cover] : [],
          args: ([input, coverPath]) => [
            "-i",
            input!,
            ...(coverPath ? ["-i", coverPath] : []),
            "-map",
            audioOnly && (coverPath || removeCover || stripAll) ? "0:a" : "0",
            ...(coverPath ? ["-map", "1", "-disposition:v", "attached_pic"] : []),
            "-map_metadata",
            "-1",
            ...(stripAll
              ? ["-map_metadata:s", "-1", "-map_chapters", "-1", "-fflags", "+bitexact"]
              : list.filter((t) => t.value.trim()).flatMap((t) => ["-metadata", `${t.key}=${t.value}`])),
            "-c",
            "copy",
            ...(["mp4", "mov", "m4a", "m4v"].includes(ext) && !stripAll ? ["-movflags", "use_metadata_tags"] : []),
            ...(ext === "mp3" ? ["-id3v2_version", "3"] : []),
            `/out/out.${ext}`,
          ],
        },
      ]}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {media && ready && !tags && !error && <p className="text-sm text-ink-2">reading the details…</p>}
      {tags && !stripAll && (
        <div className="space-y-4">
          {location.length > 0 && (
            <div className="space-y-2 rounded-md border-2 border-red-600 bg-red-50 p-3">
              <p className="flex items-center gap-2 text-sm">
                <MapPin className="size-4" /> This file records where it was made.
              </p>
              <Button onClick={() => setTags(list.filter((t) => !isLocation(t.key)))}>
                remove the location
              </Button>
            </div>
          )}
          {device.length > 0 && (
            <div className="space-y-2 rounded-md border-2 border-ink bg-paper-2 p-3">
              <p className="flex items-center gap-2 text-sm">
                <Smartphone className="size-4" />
                {device.map((t) => t.value).join(" · ")}
              </p>
              <Button onClick={() => setTags(list.filter((t) => !isDevice(t.key)))}>
                remove camera and app details
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {list.map(row)}
            {!list.length && <p className="text-sm text-ink-2">No details stored in this file.</p>}
          </div>
          {missing.length > 0 && (
            <Select
              label="Add a field"
              value=""
              onChange={(key) => key && setTags([...list, { key, value: "" }])}
              options={[{ value: "", label: "add a field…" }, ...missing.map((k) => ({ value: k, label: k }))]}
            />
          )}
          {info?.hasCoverArt && <p className="text-sm text-ink-2">This file has cover art.</p>}
        </div>
      )}
    </EnginePage>
  );
}
