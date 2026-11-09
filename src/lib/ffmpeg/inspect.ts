import { FriendlyError } from "../errors";
import type { MediaInfo } from "../engine/inspect";
import { ffmpegDescribe } from "./engine";
import { parseFfmpegInfo } from "./probe";

/** Reads a file the browser can't, through the video engine. */
export async function inspectWithEngine(file: File): Promise<MediaInfo> {
  const info = parseFfmpegInfo(await ffmpegDescribe(file), file);
  if (!info || (!info.video.length && !info.audio.length)) {
    throw new FriendlyError(
      `Couldn't read ${file.name}, even with the video engine. It may be damaged, or not a video or audio file.`,
    );
  }
  return info;
}
