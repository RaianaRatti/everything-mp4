/** Reading and writing subtitles: SRT, WebVTT, ASS/SSA, SBV, TTML and plain text. */

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
  /** Per-word timings, when known (from auto captions). */
  words?: Word[];
}

export type SubFormat = "srt" | "vtt" | "ass" | "sbv" | "ttml" | "txt";

export const SUB_FORMATS: { value: SubFormat; label: string; mime: string }[] = [
  { value: "srt", label: "SRT (most common)", mime: "application/x-subrip" },
  { value: "vtt", label: "WebVTT (web players)", mime: "text/vtt" },
  { value: "ass", label: "ASS (styled)", mime: "text/x-ssa" },
  { value: "sbv", label: "SBV (YouTube)", mime: "text/plain" },
  { value: "ttml", label: "TTML / DFXP", mime: "application/ttml+xml" },
  { value: "txt", label: "plain text (transcript)", mime: "text/plain" },
];

/** Decodes a subtitle file: UTF-8 (with or without BOM, or UTF-16), else Windows-1252. */
export async function readSubtitleFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    // Older subtitle files are often in a Western European codepage.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** "00:01:02,500", "1:02.5", "0:00:01.000" → seconds. */
function parseStamp(s: string): number {
  const parts = s.trim().replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function pad(n: number, size = 2) {
  return String(Math.floor(n)).padStart(size, "0");
}

function stamp(seconds: number, sep: "," | ".", hourDigits = 2): string {
  const t = Math.max(0, seconds);
  const ms = Math.round((t % 1) * 1000);
  const whole = Math.floor(t) + (ms === 1000 ? 1 : 0);
  return `${pad(whole / 3600, hourDigits)}:${pad((whole % 3600) / 60)}:${pad(whole % 60)}${sep}${pad(ms % 1000, 3)}`;
}

export function detectFormat(name: string, text: string): SubFormat {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "vtt" || text.startsWith("WEBVTT")) return "vtt";
  if (ext === "ass" || ext === "ssa" || /^\[Script Info\]/m.test(text)) return "ass";
  if (ext === "ttml" || ext === "dfxp" || ext === "xml" || /<tt[\s>]/.test(text)) return "ttml";
  if (ext === "sbv") return "sbv";
  if (ext === "txt") return "txt";
  return "srt";
}

const TIMING = /(\d+:\d{1,2}(?::\d{1,2})?[.,]\d+)\s*(?:-->|,)\s*(\d+:\d{1,2}(?::\d{1,2})?[.,]\d+)/;

function parseBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => TIMING.test(l));
    if (i < 0) continue;
    const m = TIMING.exec(lines[i]!)!;
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    cues.push({ start: parseStamp(m[1]!), end: parseStamp(m[2]!), text: body });
  }
  return cues;
}

function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let format: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\[Events\]/i.test(line)) format = [];
    if (/^Format:/i.test(line)) format = line.slice(7).split(",").map((s) => s.trim().toLowerCase());
    if (!/^Dialogue:/i.test(line)) continue;
    const fields = line.slice(9).split(",");
    const textIndex = format.indexOf("text");
    const n = textIndex >= 0 ? textIndex : 9;
    const get = (k: string, d: number) => fields[format.indexOf(k) >= 0 ? format.indexOf(k) : d] ?? "";
    cues.push({
      start: parseStamp(get("start", 1)),
      end: parseStamp(get("end", 2)),
      text: fields
        .slice(n)
        .join(",")
        .replace(/\{[^}]*\}/g, "")
        .replace(/\\N/gi, "\n")
        .trim(),
    });
  }
  return cues;
}

function parseTtml(text: string): Cue[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const time = (v: string | null): number => {
    if (!v) return 0;
    const m = /^([\d.]+)(h|m|s|ms|t)$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      return m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : m[2] === "ms" ? n / 1000 : m[2] === "t" ? n / 10_000_000 : n;
    }
    return parseStamp(v.split(":").length > 3 ? v.split(":").slice(0, 3).join(":") : v);
  };
  return [...doc.getElementsByTagName("p")].map((p) => {
    const clone = p.cloneNode(true) as Element;
    for (const br of [...clone.getElementsByTagName("br")]) br.replaceWith("\n");
    const start = time(p.getAttribute("begin"));
    const end = p.getAttribute("end") ? time(p.getAttribute("end")) : start + time(p.getAttribute("dur"));
    return { start, end, text: (clone.textContent ?? "").trim() };
  });
}

/** A plain transcript: each non-empty line gets 3 seconds, one after another. */
function parseTxt(text: string): Cue[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t, i) => ({ start: i * 3, end: i * 3 + 3, text: t }));
}

export function parseSubtitles(text: string, format: SubFormat): Cue[] {
  const cues =
    format === "ass"
      ? parseAss(text)
      : format === "ttml"
        ? parseTtml(text)
        : format === "txt"
          ? parseTxt(text)
          : parseBlocks(text);
  return cues.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
}

export async function loadSubtitles(file: File): Promise<{ cues: Cue[]; format: SubFormat }> {
  const text = await readSubtitleFile(file);
  const format = detectFormat(file.name, text);
  return { cues: parseSubtitles(text, format), format };
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function writeSubtitles(cues: Cue[], format: SubFormat): string {
  switch (format) {
    case "srt":
      return cues
        .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`)
        .join("\n");
    case "vtt":
      return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`;
    case "sbv":
      return cues
        .map((c) => `${stamp(c.start, ".", 1)},${stamp(c.end, ".", 1)}\n${c.text}\n`)
        .join("\n");
    case "txt":
      return cues.map((c) => c.text.replace(/\n/g, " ")).join("\n") + "\n";
    case "ttml":
      return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
${cues.map((c) => `<p begin="${stamp(c.start, ".")}" end="${stamp(c.end, ".")}">${escapeXml(c.text).replace(/\n/g, "<br/>")}</p>`).join("\n")}
</div></body></tt>
`;
    case "ass": {
      const t = (s: number) => {
        const cs = Math.round(s * 100);
        return `${Math.floor(cs / 360000)}:${pad((cs / 6000) % 60)}:${pad((cs / 100) % 60)}.${pad(cs % 100)}`;
      };
      return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.map((c) => `Dialogue: 0,${t(c.start)},${t(c.end)},Default,,0,0,0,,${c.text.replace(/\n/g, "\\N")}`).join("\n")}
`;
    }
  }
}

export function subtitleFile(cues: Cue[], format: SubFormat, base: string): File {
  const mime = SUB_FORMATS.find((f) => f.value === format)!.mime;
  return new File([writeSubtitles(cues, format)], `${base}.${format}`, { type: mime });
}

/** Groups words into readable subtitle lines (about 42 characters, at most ~5 seconds). */
export function wordsToCues(words: Word[], maxChars = 42, maxSeconds = 5): Cue[] {
  const cues: Cue[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      text: current.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
      words: current,
    });
    current = [];
  };
  for (const w of words) {
    const text = [...current, w].map((x) => x.text).join(" ");
    const prev = current[current.length - 1];
    if (
      current.length &&
      (text.length > maxChars ||
        w.end - current[0]!.start > maxSeconds ||
        (prev && w.start - prev.end > 0.8))
    )
      flush();
    current.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  return cues;
}

/** Splits a cue's time evenly over its words, for cues without word timings. */
export function estimateWords(cue: Cue): Word[] {
  if (cue.words?.length) return cue.words;
  const parts = cue.text.split(/\s+/).filter(Boolean);
  const step = (cue.end - cue.start) / Math.max(1, parts.length);
  return parts.map((text, i) => ({
    text,
    start: cue.start + i * step,
    end: cue.start + (i + 1) * step,
  }));
}
