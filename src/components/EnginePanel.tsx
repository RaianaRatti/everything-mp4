import { Cpu, Gauge, Zap } from "lucide-react";
import type { EngineChoice } from "../lib/engine/choose";
import { ENGINE_BYTES, loadEngine, useEngine } from "../lib/ffmpeg/engine";
import { Button } from "./ui";

/**
 * Explains that something needs the video engine (ffmpeg), says how big it is, and loads it on
 * request with a progress bar. Renders nothing once the engine is running.
 */
export function EnginePanel({ reason }: { reason: string }) {
  const { status, fraction, error, threads } = useEngine();
  if (status === "ready") return null;
  const size = `${Math.round(ENGINE_BYTES / 1024 ** 2)} MB`;

  return (
    <div className="space-y-3 rounded-lg border-3 border-ink bg-card p-4 shadow-pop-sm">
      <p className="flex items-center gap-2">
        <Cpu className="size-5 shrink-0" aria-hidden />
        {status === "loading" ? "loading the video engine…" : "this needs the video engine"}
      </p>
      <p className="text-sm text-ink-2">
        {reason} The video engine (ffmpeg) is about {size}. It's downloaded once and kept
        for next time.
      </p>
      {status === "loading" ? (
        <div className="space-y-1">
          <div className="h-4 overflow-hidden rounded-md border-3 border-ink bg-paper-3">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
          <p className="text-xs text-ink-3">
            {fraction < 1 ? `downloading… ${Math.floor(fraction * 100)}%` : "starting…"}
          </p>
        </div>
      ) : (
        <Button variant="primary" onClick={() => void loadEngine().catch(() => {})}>
          load video engine ({size})
        </Button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!threads && (
        <p className="text-xs text-ink-3">
          This page can't use several processor cores, so the engine runs on one. It works, just
          slower.
        </p>
      )}
    </div>
  );
}

/** Shows which engine a job will use and why: copy, the browser's encoder, or the video engine. */
export function EngineBadge({ choice }: { choice: EngineChoice }) {
  const Icon = choice.copy ? Zap : choice.engine === "browser" ? Gauge : Cpu;
  return (
    <div
      className={`space-y-1 rounded-md border-3 p-3 text-sm ${
        choice.engine === null ? "border-red-600 bg-red-50" : "border-ink bg-paper-2"
      }`}
    >
      <p className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        {choice.summary}
      </p>
      <p className="text-xs text-ink-2">{choice.reason}</p>
    </div>
  );
}
