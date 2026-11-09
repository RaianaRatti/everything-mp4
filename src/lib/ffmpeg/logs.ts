/** "01:02:03.45" → 3723.45; null when it isn't a time. */
export function parseClock(text: string): number | null {
  const m = /^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return m[1] ? -seconds : seconds;
}

/** The output time in a progress line ("frame=  50 … time=00:00:02.00 bitrate=…"), in seconds. */
export function parseProgressTime(line: string): number | null {
  const m = /\btime=\s*(-?\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
  return m ? parseClock(m[1]!) : null;
}

/** The input length in a "Duration: 00:01:23.45, start: …" line, in seconds. */
export function parseDurationLine(line: string): number | null {
  const m = /^\s*Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
  return m ? parseClock(m[1]!) : null;
}

/**
 * Names from `ffmpeg -muxers` / `-demuxers` / `-encoders` output. Muxer lines look like
 * " E  mp4             MP4 (MPEG-4 Part 14)"; encoder lines like " V....D libx264  …".
 */
export function parseListing(lines: readonly string[], kind: "muxers" | "encoders"): Set<string> {
  const names = new Set<string>();
  const pattern =
    kind === "muxers" ? /^\s*D?\s*E\s+(\S+)\s/ : /^\s*[VAS][F.][S.][X.][B.][D.]\s+(\S+)\s/;
  for (const line of lines) {
    const m = pattern.exec(line);
    // The listing header has a "=" separator line and legend lines like " V..... = Video".
    if (m && m[1] !== "=") for (const name of m[1]!.split(",")) names.add(name);
  }
  return names;
}

const FRIENDLY_ERRORS: [RegExp, string][] = [
  [
    /Invalid data found when processing input|moov atom not found|could not find codec parameters/i,
    "This file looks damaged, or it isn't a format the video engine knows.",
  ],
  [
    /Cannot allocate memory|Out of memory|memory access out of bounds|\bOOM\b/i,
    "The video engine ran out of memory. Try a shorter part, a smaller size, or close other tabs.",
  ],
  [
    /(width|height) not divisible by 2|dimensions not set|Invalid image size/i,
    "The video engine needs the width and height to be even numbers. Pick another size.",
  ],
  [
    /Could not find tag for codec|not supported in this container|codec not currently supported in container|does not support .* codec/i,
    "That format can't hold this kind of video or sound. Pick another codec or format.",
  ],
  [
    /Unknown encoder|Encoder not found|Unknown decoder/i,
    "This video engine can't make that codec.",
  ],
  [
    /Error while opening encoder|Error initializing output stream|Incorrect codec parameters|Error while opening decoder/i,
    "The encoder didn't accept these settings. Try a different size, frame rate or sound setting.",
  ],
  [
    /Output file #?\d* does not contain any stream|matches no streams|Output file is empty/i,
    "There's nothing to save: no video or sound could be used from this file.",
  ],
  [/No such file or directory/i, "The video engine couldn't open the file."],
];

/** A plain explanation of why an ffmpeg run failed, from its log. */
export function explainFailure(lines: readonly string[]): string {
  const text = lines.join("\n");
  for (const [pattern, message] of FRIENDLY_ERRORS) if (pattern.test(text)) return message;
  return "The video engine couldn't process this file.";
}
