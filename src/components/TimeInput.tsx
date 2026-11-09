import { useState } from "react";
import { formatTime, parseTime } from "../lib/time";

/** A time field that accepts "1:00", "3:20.5", "200" or "3m20s" and applies on Enter or blur. */
export function TimeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseTime(draft) === null;

  const commit = () => {
    if (draft === null) return;
    const seconds = parseTime(draft);
    if (seconds !== null) onCommit(seconds);
    setDraft(null);
  };

  return (
    <label className="block space-y-1">
      <span className="text-xs text-ink-2">{label}</span>
      <input
        value={draft ?? formatTime(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        aria-invalid={invalid}
        className={`w-28 rounded-md border-3 bg-card px-2 py-1.5 text-sm tabular-nums focus:outline-2 focus:outline-offset-1 focus:outline-ink ${
          invalid ? "border-red-600" : "border-ink"
        }`}
      />
    </label>
  );
}
