import { useState } from "react";
import { EnginePage } from "../../components/EnginePage";
import { FileActions } from "../../components/FileActions";
import { FilePreview } from "../../components/MediaFiles";
import { Field, PanelSection, Select } from "../../components/ui";
import { fitGraph, safeBase, type FitMode } from "../../lib/ffmpeg/edit";
import { formatBytes, outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";
import { useObjectUrl } from "../../lib/objectUrl";
import { formatTime } from "../../lib/time";
import { LAST_CHECKED, PLATFORMS } from "./platforms";

const AUDIO_BITRATE = 128_000;

export default function MakeFor() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [platformId, setPlatformId] = useState("reels");
  const [fit, setFit] = useState<FitMode>("blur");
  const [position, setPosition] = useState(0.5);
  const [tooLong, setTooLong] = useState<"trim" | "split">("trim");

  const p = PLATFORMS.find((x) => x.id === platformId)!;
  const duration = media?.info.duration ?? 0;
  const long = p.maxSeconds !== null && duration > p.maxSeconds;
  const length = long && tooLong === "trim" ? p.maxSeconds! : duration;
  const partLength = long && tooLong === "split" ? p.maxSeconds! : length;
  // Aim a little under the size limit, since encoders don't hit a bitrate exactly.
  const videoBitrate = p.maxBytes
    ? Math.max(150_000, (p.maxBytes * 8 * 0.92) / Math.max(partLength, 1) - AUDIO_BITRATE)
    : null;
  const hasAudio = !!media?.info.audio.length;

  const settings = media && (
    <PanelSection title="post">
      <Field label="platform">
        <Select
          label="Platform"
          value={platformId}
          onChange={setPlatformId}
          options={PLATFORMS.map((x) => ({ value: x.id, label: x.label }))}
        />
      </Field>
      <Field label="fit">
        <Select
          label="Fit"
          value={fit}
          onChange={setFit}
          options={[
            { value: "blur", label: "fit with blurred background" },
            { value: "bars", label: "fit with black bars" },
            { value: "crop", label: "crop to fill" },
            { value: "stretch", label: "stretch" },
          ]}
        />
      </Field>
      {fit === "crop" && (
        <Field label="which part to keep">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="w-full accent-black"
            aria-label="Crop position"
          />
        </Field>
      )}
      {long && (
        <Field label={`longer than ${formatTime(p.maxSeconds!, 0)}`}>
          <Select
            label="Too long"
            value={tooLong}
            onChange={setTooLong}
            options={[
              { value: "trim", label: `keep the first ${formatTime(p.maxSeconds!, 0)}` },
              {
                value: "split",
                label: `split into ${Math.ceil(duration / p.maxSeconds!)} parts`,
              },
            ]}
          />
        </Field>
      )}
      <p className="text-sm">
        {p.width}×{p.height}
        {p.maxBytes ? ` · up to ${formatBytes(p.maxBytes)}` : ""}
      </p>
      {videoBitrate && (
        <p className="text-xs text-ink-3">Compressed to fit the size limit.</p>
      )}
      <p className="text-xs text-ink-3">Sizes and limits last checked {LAST_CHECKED}.</p>
    </PanelSection>
  );

  return (
    <EnginePage
      toolId="make-for"
      subtitle="Get a video ready to post"
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action={`get it ready for ${p.label}`}
      running="making…"
      disabled={!media?.info.video.length && "This file has no video."}
      jobs={() => [
        {
          duration: length,
          mime: "video/mp4",
          name: long && tooLong === "split" ? undefined : outputName(media!.file.name, p.id, "mp4"),
          args: ([input]) => [
            "-i",
            input!,
            ...(long && tooLong === "trim" ? ["-t", String(p.maxSeconds)] : []),
            "-filter_complex",
            fitGraph("0:v", "v", p.width, p.height, fit, { position }),
            "-map",
            "[v]",
            ...(hasAudio ? ["-map", "0:a:0"] : []),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            ...(videoBitrate
              ? ["-b:v", String(Math.round(videoBitrate)), "-maxrate", String(Math.round(videoBitrate * 1.2)), "-bufsize", String(Math.round(videoBitrate * 2))]
              : ["-crf", "20"]),
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            String(AUDIO_BITRATE),
            ...(long && tooLong === "split"
              ? [
                  "-force_key_frames",
                  `expr:gte(t,n_forced*${p.maxSeconds})`,
                  "-f",
                  "segment",
                  "-segment_time",
                  String(p.maxSeconds),
                  "-segment_start_number",
                  "1",
                  "-reset_timestamps",
                  "1",
                  `/out/${safeBase(media!.file)}-${p.id}_part%02d.mp4`,
                ]
              : ["-movflags", "+faststart", "/out/out.mp4"]),
          ],
        },
      ]}
    >
      {media && !media.info.canPlay && (
        <FilePreview file={media.file} info={media.info} onRemove={() => setMedia(null)} />
      )}
      {media && media.info.canPlay && (
        <FramePreview
          onRemove={() => setMedia(null)}
          file={media.file}
          width={p.width}
          height={p.height}
          fit={fit}
          position={position}
        />
      )}
    </EnginePage>
  );
}

/** A live, CSS-only stand-in for the export's framing. */
function FramePreview({
  file,
  width,
  height,
  fit,
  position,
  onRemove,
}: {
  onRemove: () => void;
  file: File;
  width: number;
  height: number;
  fit: FitMode;
  position: number;
}) {
  const url = useObjectUrl(file);
  if (!url) return null;
  const objectFit = fit === "crop" ? "cover" : fit === "stretch" ? "fill" : "contain";
  return (
    <div
      className="relative mx-auto max-h-[60vh] overflow-hidden rounded-md border-3 border-ink bg-black"
      style={{ aspectRatio: `${width} / ${height}`, height: height > width ? "60vh" : undefined, width: height > width ? undefined : "100%" }}
    >
      {fit === "blur" && (
        <video
          src={url}
          muted
          loop
          autoPlay
          playsInline
          className="absolute inset-0 size-full scale-110 object-cover blur-xl"
        />
      )}
      <video
        src={url}
        muted
        loop
        autoPlay
        playsInline
        controls
        className="absolute inset-0 size-full"
        style={{ objectFit, objectPosition: `${position * 100}% ${position * 100}%` }}
      />
      <FileActions onRemove={onRemove} className="absolute top-2 right-2 z-10" />
    </div>
  );
}
