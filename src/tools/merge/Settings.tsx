import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button, Field, PanelSection, Segmented, inputClass } from "../../components/ui";
import { FULL, type Fit, type Preset, type Rect } from "../../lib/layout";
import {
  drawOrder,
  outputFps,
  useMerge,
  useOutputSize,
  videoName,
  type FpsChoice,
  type QualityChoice,
  type SizeChoice,
} from "./state";

const LAYOUTS: { value: Preset; label: string }[] = [
  { value: "overlay", label: "overlay" },
  { value: "side-by-side", label: "beside" },
  { value: "stacked", label: "stacked" },
];

const GRID: { value: Preset; label: string } = { value: "grid", label: "grid" };

const FITS: { value: Fit; label: string }[] = [
  { value: "contain", label: "whole" },
  { value: "cover", label: "crop" },
  { value: "fill", label: "stretch" },
];

const FRAME_SIZES: { value: SizeChoice; label: string }[] = [
  { value: "1920x1080", label: "1080p landscape (1920×1080)" },
  { value: "1280x720", label: "720p landscape (1280×720)" },
  { value: "3840x2160", label: "4K landscape (3840×2160)" },
  { value: "1080x1920", label: "vertical (1080×1920)" },
  { value: "1080x1080", label: "square (1080×1080)" },
];

const QUALITIES: { value: QualityChoice; label: string }[] = [
  { value: "medium", label: "small" },
  { value: "high", label: "high" },
  { value: "very-high", label: "best" },
];

/** Layout, box position and output settings, shown beside the preview. */
export function Settings() {
  const clips = useMerge((s) => s.clips);
  const layout = useMerge((s) => s.layout);
  const order = useMerge((s) => s.order);
  const selected = useMerge((s) => s.selected);
  const applyLayout = useMerge((s) => s.applyLayout);
  const moveLayer = useMerge((s) => s.moveLayer);
  const select = useMerge((s) => s.select);
  const setRect = useMerge((s) => s.setRect);
  const updateClip = useMerge((s) => s.updateClip);
  const size = useMerge((s) => s.size);
  const fps = useMerge((s) => s.fps);
  const quality = useMerge((s) => s.quality);
  const setSize = useMerge((s) => s.setSize);
  const setFps = useMerge((s) => s.setFps);
  const setQuality = useMerge((s) => s.setQuality);
  const frame = useOutputSize();
  const sourceFps = useMerge((s) => outputFps({ clips: s.clips, fps: "source" }));

  const count = clips.length;
  const many = count > 2;
  const slot = Math.min(selected, count - 1);
  const clip = clips[slot];
  const layers = drawOrder({ clips, order });
  const layer = layers.indexOf(slot);
  const sizes: { value: SizeChoice; label: string }[] = [
    { value: "first", label: "same as first video" },
    ...clips.slice(1).map((c, i) => ({
      value: `clip:${c.id}` as const,
      label: `same as ${videoName(i + 1)}`,
    })),
    ...FRAME_SIZES,
  ];

  return (
    <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
      {count > 1 && (
        <PanelSection title="layout">
          <Segmented
            label="Layout"
            value={layout === "custom" ? ("" as Preset) : layout}
            options={many || layout === "grid" ? [...LAYOUTS, GRID] : LAYOUTS}
            onChange={applyLayout}
          />
          {!many && (
            <Button onClick={() => moveLayer(layers[0]!, 1)} className="w-full">
              <ArrowUpDown className="size-4" aria-hidden />
              {videoName(layers[1]!)} is on top
            </Button>
          )}
        </PanelSection>
      )}

      {clip && (
        <PanelSection title="position">
          {count > 1 && (
            <Segmented
              label="Video to position"
              value={String(slot)}
              options={clips.map((_, i) => ({
                value: String(i),
                label: many ? String(i + 1) : videoName(i),
              }))}
              onChange={(v) => select(Number(v))}
            />
          )}
          {many && (
            <div className="space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => moveLayer(slot, -1)} disabled={layer <= 0}>
                  <ArrowDown className="size-4" aria-hidden />
                  send back
                </Button>
                <Button onClick={() => moveLayer(slot, 1)} disabled={layer >= count - 1}>
                  <ArrowUp className="size-4" aria-hidden />
                  bring forward
                </Button>
              </div>
              <p className="text-xs text-ink-3">
                {layer === count - 1
                  ? "on top of the others"
                  : layer === 0
                    ? "under the others"
                    : `layer ${layer + 1} of ${count}, counting from the bottom`}
              </p>
            </div>
          )}
          <RectFields rect={clip.rect} frame={frame} onChange={(rect) => setRect(slot, rect)} />
          <Field label="fit in its box">
            <Segmented
              label="Fit"
              value={clip.fit}
              options={FITS}
              onChange={(fit) => updateClip(slot, { fit })}
            />
          </Field>
          <Button onClick={() => setRect(slot, FULL)} className="w-full" variant="ghost">
            make full screen
          </Button>
        </PanelSection>
      )}

      <PanelSection title="output">
        <Field label="size">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as SizeChoice)}
            className={inputClass}
          >
            {sizes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="-mt-1 text-xs text-ink-3">
          {frame.width}×{frame.height}
        </p>
        <Field label="frame rate">
          <select
            value={fps}
            onChange={(e) => setFps(e.target.value as FpsChoice)}
            className={inputClass}
          >
            <option value="source">same as the videos ({sourceFps} fps)</option>
            {(["24", "25", "30", "60"] as const).map((v) => (
              <option key={v} value={v}>
                {v} fps
              </option>
            ))}
          </select>
        </Field>
        <Field label="quality">
          <Segmented label="Quality" value={quality} options={QUALITIES} onChange={setQuality} />
        </Field>
      </PanelSection>
    </div>
  );
}

/** Position and size of a box as percentages of the frame, editable by number. */
function RectFields({
  rect,
  frame,
  onChange,
}: {
  rect: Rect;
  frame: { width: number; height: number };
  onChange: (rect: Rect) => void;
}) {
  const fields: { key: keyof Rect; label: string; px: number }[] = [
    { key: "x", label: "left", px: frame.width },
    { key: "y", label: "top", px: frame.height },
    { key: "w", label: "width", px: frame.width },
    { key: "h", label: "height", px: frame.height },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(({ key, label, px }) => (
        <label key={key} className="block space-y-1">
          <span className="text-xs text-ink-2">
            {label} <span className="text-ink-3">({Math.round(rect[key] * px)}px)</span>
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step={1}
              value={Math.round(rect[key] * 1000) / 10}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!Number.isFinite(value)) return;
                if ((key === "w" || key === "h") && value < 1) return;
                onChange({ ...rect, [key]: value / 100 });
              }}
              className={`${inputClass} py-1.5 tabular-nums`}
            />
            <span className="text-sm text-ink-3">%</span>
          </div>
        </label>
      ))}
    </div>
  );
}
