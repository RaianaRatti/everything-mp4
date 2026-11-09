import type { CSSProperties, ReactNode } from "react";
import { useObjectUrl } from "../lib/objectUrl";
import { FileActions } from "./FileActions";

/**
 * A video at its real shape with things drawn on top (text, watermarks, boxes) and an optional
 * CSS filter, as a live preview. Children are positioned over the picture; use percentages.
 */
export function OverlayPreview({
  file,
  width,
  height,
  children,
  videoStyle,
  onTime,
  onRemove,
}: {
  file: File;
  width: number;
  height: number;
  children?: ReactNode;
  videoStyle?: CSSProperties;
  onTime?: (seconds: number) => void;
  onRemove?: () => void;
}) {
  const url = useObjectUrl(file);
  if (!url) return null;
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-md border-3 border-ink bg-black"
      style={{
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, calc(60vh * ${width / height}))`,
        containerType: "size",
      }}
    >
      <video
        src={url}
        controls
        playsInline
        loop
        onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
        className="absolute inset-0 size-full"
        style={videoStyle}
      />
      <div className="pointer-events-none absolute inset-0">{children}</div>
      <FileActions onRemove={onRemove} className="absolute top-2 right-2 z-10" />
    </div>
  );
}
