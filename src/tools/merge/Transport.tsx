import { Pause, Play } from "lucide-react";
import { formatTime } from "../../lib/time";
import { player, usePlayback } from "./player";
import { clipLength, outputDuration, useMerge } from "./state";

/** Play/pause, the playhead, and a bar per video showing where each one runs out. */
export function Transport() {
  const clips = useMerge((s) => s.clips);
  const time = usePlayback((s) => s.time);
  const playing = usePlayback((s) => s.playing);
  const duration = outputDuration(clips);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => player.toggle()}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (space)" : "Play (space)"}
          className="pop-press flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <span className="w-32 shrink-0 text-sm tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          aria-label="Playhead"
          min={0}
          max={duration || 1}
          step={0.01}
          value={time}
          onChange={(e) => player.seek(Number(e.target.value))}
          className="w-full accent-black"
        />
      </div>

      <div className="space-y-1 pl-[10.75rem] max-sm:pl-0">
        {clips.map((clip, slot) => {
          const share = duration ? clipLength(clip) / duration : 0;
          return (
            <div key={clip.id} className="flex items-center gap-2 text-xs text-ink-2">
              <span className="w-3 shrink-0">{slot + 1}</span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm border-2 border-ink bg-black">
                <div
                  className="absolute inset-y-0 left-0 bg-accent"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <span className="w-32 shrink-0 text-right">
                {share < 0.999 ? `black from ${formatTime(clipLength(clip))}` : "full length"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
