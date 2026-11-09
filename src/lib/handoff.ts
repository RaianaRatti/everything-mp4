import { create } from "zustand";
import type { Cue } from "./subtitles/format";
import { fileKind, type FileKind } from "./files";

/**
 * Files passed from one tool (or Home) to the next without downloading them. The next tool's
 * drop zone takes the files it accepts as if they'd been dropped.
 */
export const useHandoff = create<{
  files: File[];
  /** Captions with word timings, from auto captions, for social-style subtitles. */
  cues: Cue[] | null;
  /** When they were sent: leftovers no tool took shouldn't turn up in a tool opened later. */
  at: number;
}>(() => ({ files: [], cues: null, at: 0 }));

const FRESH_MS = 10_000;

export function handOff(files: File[], cues: Cue[] | null = null) {
  useHandoff.setState({ files, cues, at: Date.now() });
}

/** Removes and returns the waiting files of these kinds. */
export function takeHandoff(kinds: readonly FileKind[]): File[] {
  const { files, at } = useHandoff.getState();
  if (Date.now() - at > FRESH_MS) return [];
  const mine = files.filter((f) => {
    const kind = fileKind(f);
    return kind !== null && kinds.includes(kind);
  });
  if (mine.length) useHandoff.setState({ files: files.filter((f) => !mine.includes(f)) });
  return mine;
}
