import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useObjectUrl } from "../lib/objectUrl";

/**
 * Two videos on top of each other with a divider: the original on the left, the result on the
 * right. Drag the slider (or use the arrow keys on it) to compare. Both play in step.
 */
export function CompareSlider({ before, after }: { before: Blob; after: Blob }) {
  const beforeUrl = useObjectUrl(before);
  const afterUrl = useObjectUrl(after);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);

  // The result leads; the original follows it.
  useEffect(() => {
    const a = afterRef.current;
    const b = beforeRef.current;
    if (!a || !b) return;
    const follow = () => {
      if (Math.abs(b.currentTime - a.currentTime) > 0.15) b.currentTime = a.currentTime;
    };
    const onPlay = () => {
      setPlaying(true);
      void b.play().catch(() => {});
    };
    const onPause = () => {
      setPlaying(false);
      b.pause();
      follow();
    };
    a.addEventListener("timeupdate", follow);
    a.addEventListener("seeked", follow);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", follow);
      a.removeEventListener("seeked", follow);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [beforeUrl, afterUrl]);

  if (!beforeUrl || !afterUrl) return null;
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border-2 border-ink bg-black">
        <video ref={beforeRef} src={beforeUrl} muted loop playsInline className="block w-full" />
        <video
          ref={afterRef}
          src={afterUrl}
          loop
          playsInline
          className="absolute inset-0 block size-full"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
          style={{ left: `${split}%` }}
          aria-hidden
        />
        <span className="absolute top-2 left-2 rounded-sm bg-black/60 px-1.5 text-xs text-white">
          before
        </span>
        <span className="absolute top-2 right-2 rounded-sm bg-accent px-1.5 text-xs text-ink">
          after
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const a = afterRef.current;
            if (!a) return;
            if (a.paused) void a.play().catch(() => {});
            else a.pause();
          }}
          aria-label={playing ? "Pause" : "Play"}
          className="pop-press flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Compare before and after"
          className="w-full accent-black"
        />
      </div>
    </div>
  );
}
