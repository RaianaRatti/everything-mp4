import { FriendlyError } from "../errors";

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export const IMAGE_EXT: Record<ImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Encodes a canvas (on-screen or offscreen) as an image file. */
export async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: ImageType = "image/png",
  quality = 0.92,
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new FriendlyError("This browser couldn't save the image.")),
      type,
      quality,
    ),
  );
}

/** The frame a <video> is showing, at its full resolution, as an image file. */
export async function grabFrame(
  video: HTMLVideoElement,
  type: ImageType = "image/png",
): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new FriendlyError("The video isn't ready yet. Try again in a moment.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new FriendlyError("This browser can't draw video frames.");
  ctx.drawImage(video, 0, 0);
  return canvasToBlob(canvas, type);
}
