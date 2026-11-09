/**
 * Parses a time typed by a person into seconds. Accepts plain seconds ("200", "12.5"),
 * clock times ("3:20", "1:02:03.5") and unit forms ("3m20s", "1h 2m", "90s").
 * Returns null when the text isn't a time.
 */
export function parseTime(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);

  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (clock) {
    const [, h = "0", m = "0", sec = "0"] = clock;
    if (Number(sec) >= 60 || (clock[1] !== undefined && Number(m) >= 60)) return null;
    return Number(h) * 3600 + Number(m) * 60 + Number(sec);
  }

  const units =
    /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/.exec(
      s,
    );
  if (units && (units[1] ?? units[2] ?? units[3]) !== undefined) {
    const [, h = "0", m = "0", sec = "0"] = units;
    return Number(h) * 3600 + Number(m) * 60 + Number(sec);
  }

  return null;
}

/** Formats seconds as m:ss.t (or h:mm:ss.t past an hour), e.g. 200.25 → "3:20.2". */
export function formatTime(seconds: number, decimals = 1): string {
  const scale = 10 ** decimals;
  const total = Math.max(0, Math.floor(seconds * scale + 1e-6) / scale);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const secText = sec.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${secText}` : `${m}:${secText}`;
}
