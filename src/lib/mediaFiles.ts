import type { MediaInfo } from "./engine/inspect";
import { formatBytes } from "./files";
import { formatTime } from "./time";

export interface MediaFile {
  id: number;
  file: File;
  info: MediaInfo;
}

let nextId = 0;
export function toMediaFiles(items: { file: File; result: MediaInfo }[]): MediaFile[] {
  return items.map(({ file, result }) => ({ id: nextId++, file, info: result }));
}

/** "12.3 MB · 1:02 · 1920×1080 · 30 fps". */
export function summary(info: MediaInfo): string {
  const v = info.video[0];
  return [
    formatBytes(info.size),
    formatTime(info.duration, 0),
    v ? `${v.width}×${v.height}` : info.audio.length ? "audio only" : null,
    v?.fps ? `${v.fps} fps` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
