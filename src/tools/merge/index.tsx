import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ExportDialog } from "../../components/ExportDialog";
import { FileDrop } from "../../components/FileDrop";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { fileKind, outputName } from "../../lib/files";
import { isTyping } from "../../lib/keys";
import { probeVideo, UnreadableVideoError, type VideoInfo } from "../../lib/probe";
import { formatTime } from "../../lib/time";
import { ClipCard } from "./ClipCard";
import { exportMerge } from "./export";
import { player } from "./player";
import { Settings } from "./Settings";
import { Stage } from "./Stage";
import { drawOrder, outputDuration, outputFps, outputSize, useMerge, type Slot } from "./state";
import { Transport } from "./Transport";

export default function Merge() {
  const clips = useMerge((s) => s.clips);
  const addClips = useMerge((s) => s.addClips);
  const replaceClip = useMerge((s) => s.replaceClip);
  /** Videos being read to add, and to replace existing ones. */
  const [adding, setAdding] = useState(0);
  const [replacing, setReplacing] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const duration = outputDuration(clips);

  /** Reads the video files among `files`, keeping their order and skipping unreadable ones. */
  const readVideos = async (files: File[], track: Dispatch<SetStateAction<number>>) => {
    const videos = files.filter((f) => fileKind(f) === "video");
    setErrors(videos.length || !files.length ? [] : ["That doesn't look like a video file."]);
    if (!videos.length) return [];
    track((n) => n + videos.length);
    const read = await Promise.all(
      videos.map(async (file) => {
        try {
          return { file, info: await probeVideo(file) };
        } catch (err) {
          console.error(err);
          setErrors((prev) => [
            ...prev,
            err instanceof UnreadableVideoError
              ? `Can't read ${file.name}. MP4, MOV, WebM and MKV files work best.`
              : `Something went wrong reading ${file.name}.`,
          ]);
          return null;
        }
      }),
    );
    track((n) => n - videos.length);
    return read.filter((v): v is { file: File; info: VideoInfo } => v !== null);
  };

  const addFiles = async (files: File[]) => addClips(await readVideos(files, setAdding));

  const replaceFile = async (slot: Slot, files: File[]) => {
    const id = clips[slot]?.id;
    const [video] = await readVideos(files.slice(0, 1), setReplacing);
    // Find the clip again: others may have been removed while this one was read.
    const index = useMerge.getState().clips.findIndex((c) => c.id === id);
    if (video && index >= 0) replaceClip(index, video.file, video.info);
  };

  // Space plays and pauses, unless you're typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || exporting || isTyping(e.target)) return;
      e.preventDefault();
      player.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exporting]);

  useEffect(() => () => player.pause(), []);

  const sidebar = clips.length ? (
    <>
      <Settings />
      <ActionButton
        disabled={duration <= 0 || adding > 0 || replacing > 0}
        onClick={() => setExporting(true)}
      >
        export mp4 · {formatTime(duration, 0)}
      </ActionButton>
      <p className="text-xs leading-relaxed text-ink-3">
        The merged video lasts as long as the longest part;
        shorter ones' boxes turn black when they run out.
      </p>
    </>
  ) : undefined;

  return (
    <ToolLayout toolId="merge" sidebar={sidebar}>
      {!clips.length ? (
        <>
          {Array.from({ length: adding }, (_, i) => (
            <Reading key={i} />
          ))}
          <FileDrop
            accept={["video"]}
            multiple
            subtitle="Play videos at the same time: side by side, picture in picture or in a grid"
            load={async (file: File) => file}
            onLoad={(items) => void addFiles(items.map((i) => i.file))}
          />
          <Errors errors={errors} />
        </>
      ) : (
        <>
          <Stage />
          <Transport />
          <div className="grid gap-5 md:grid-cols-2">
            {clips.map((clip, slot) => (
              <ClipCard
                key={clip.id}
                slot={slot}
                clip={clip}
                onReplace={(files) => void replaceFile(slot, files)}
                onAdd={(files) => void addFiles(files)}
              />
            ))}
            {Array.from({ length: adding }, (_, i) => (
              <Reading key={`reading-${i}`} />
            ))}
            <Errors errors={errors} />
          </div>
        </>
      )}

      {exporting && <MergeExport onClose={() => setExporting(false)} />}
    </ToolLayout>
  );
}

/** Renders the merged video with the shared export dialog. */
function MergeExport({ onClose }: { onClose: () => void }) {
  const [job] = useState(() => {
    const state = useMerge.getState();
    const clips = drawOrder(state).map((slot) => state.clips[slot]!);
    return {
      name: outputName(state.clips[0]?.file.name ?? "video", "merged", "mp4"),
      clips: clips.map((c) => ({
        file: c.file,
        start: c.start,
        end: c.end,
        volume: c.info.hasAudio ? c.volume : 0,
        rect: c.rect,
        fit: c.fit,
      })),
      size: outputSize(state),
      fps: outputFps(state),
      quality: state.quality,
      duration: outputDuration(state.clips),
    };
  });
  useEffect(() => player.pause(), []);
  const { width, height } = job.size;
  // Rough upper bound for the save-to-disk offer: high quality is about 0.15 bits per pixel.
  const bytes = (width * height * job.fps * 0.15 * job.duration) / 8;

  return (
    <ExportDialog
      running="merging…"
      failed="couldn't merge"
      estimate={{ bytes, name: job.name, mimeType: "video/mp4" }}
      onClose={onClose}
      run={async ({ signal, progress, target }) => {
        const { blob, warning } = await exportMerge({
          ...job,
          target,
          signal,
          onProgress: ({ phase, fraction }) =>
            progress(
              fraction,
              phase === "audio"
                ? "mixing the audio…"
                : `rendering ${formatTime(fraction * job.duration, 0)} of ${formatTime(job.duration, 0)}`,
            ),
        });
        return { files: [{ name: job.name, blob }], warnings: warning ? [warning] : [] };
      }}
    />
  );
}

/** A box to click or drop videos on; takes several at once. */

function Reading() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl border-2 border-ink bg-card text-ink-2">
      reading video…
    </div>
  );
}

function Errors({ errors }: { errors: string[] }) {
  return errors.map((error) => (
    <p key={error} className="text-sm text-red-700">
      {error}
    </p>
  ));
}
