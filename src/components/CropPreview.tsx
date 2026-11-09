import { useObjectUrl } from "../lib/objectUrl";

/** A live preview of part of a video: the box `x, y, width, height` of a `source`-sized picture. */
export function CropPreview({
  file,
  source,
  box,
  filter,
}: {
  file: File;
  source: { width: number; height: number };
  box: { x: number; y: number; width: number; height: number };
  filter?: string;
}) {
  const url = useObjectUrl(file);
  if (!url || !box.width || !box.height) return null;
  return (
    <div className="mx-auto max-h-80 w-full max-w-md">
      <div
        className="relative w-full overflow-hidden rounded-md border-2 border-ink bg-black"
        style={{ aspectRatio: `${box.width} / ${box.height}` }}
      >
        <video
          src={url}
          muted
          loop
          autoPlay
          playsInline
          className="absolute max-w-none"
          style={{
            width: `${(source.width / box.width) * 100}%`,
            height: `${(source.height / box.height) * 100}%`,
            left: `${(-box.x / box.width) * 100}%`,
            top: `${(-box.y / box.height) * 100}%`,
            filter,
          }}
        />
      </div>
      <p className="mt-1 text-center text-xs text-ink-3">
        result preview · {box.width}×{box.height}
      </p>
    </div>
  );
}
