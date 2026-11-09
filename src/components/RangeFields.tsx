import { formatTime } from "../lib/time";
import { TimeInput } from "./TimeInput";

/** Shortest part that can be picked, in seconds. */
const MIN_LENGTH = 0.1;

/** "from" and "to" time fields for picking part of a file, with its length. */
export function RangeFields({
  start,
  end,
  duration,
  onChange,
}: {
  start: number;
  end: number;
  duration: number;
  onChange: (range: { start: number; end: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TimeInput
        label="from"
        value={start}
        onCommit={(v) => onChange({ start: Math.min(Math.max(0, v), end - MIN_LENGTH), end })}
      />
      <TimeInput
        label="to"
        value={end}
        onCommit={(v) =>
          onChange({ start, end: Math.max(Math.min(duration, v), start + MIN_LENGTH) })
        }
      />
      <p className="pb-2 text-sm text-ink-2">= {formatTime(end - start)}</p>
    </div>
  );
}
