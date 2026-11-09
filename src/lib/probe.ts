import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  /** Average frames per second, or null if it couldn't be measured. */
  fps: number | null;
  hasAudio: boolean;
  /** False when this browser can't decode the video, so it can't be exported. */
  canDecode: boolean;
}

export class UnreadableVideoError extends Error {}

export function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  const input = openInput(file);
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableVideoError(`${file.name} has no video we can read`);
    const audio = await input.getPrimaryAudioTrack();
    const [duration, width, height, canDecode, stats] = await Promise.all([
      input.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.canDecode(),
      video.computePacketStats(120).catch(() => null),
    ]);
    const fps = stats?.averagePacketRate;
    return {
      duration: duration - (await video.getFirstTimestamp()),
      width,
      height,
      fps: fps && Number.isFinite(fps) && fps > 0 ? fps : null,
      hasAudio: audio !== null,
      canDecode,
    };
  } finally {
    input.dispose();
  }
}
