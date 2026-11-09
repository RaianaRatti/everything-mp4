import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { fileKind } from "../lib/files";
import { handOff } from "../lib/handoff";
import type { Cue } from "../lib/subtitles/format";
import { tools } from "../tools/registry";

/**
 * A small "open in another tool" icon. Clicking it lists the tools that take this file; picking
 * one sends the file there without downloading it.
 */
export function OpenIn({
  file,
  exclude,
  compact = false,
  also = [],
  cues = null,
}: {
  file: File;
  exclude?: string;
  compact?: boolean;
  /** Files that go along with it, e.g. the video a subtitle file belongs to. */
  also?: File[];
  /** Captions with word timings that go along with a subtitle file. */
  cues?: Cue[] | null;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const kind = fileKind(file);
  const list = tools.filter((t) => t.id !== exclude && kind && t.accepts.includes(kind));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close just the menu, not the dialog it may be in.
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!list.length) return null;
  return (
    <div ref={root} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label="Open in another tool"
        title="Open in another tool"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`rounded-md hover:bg-accent ${compact ? "p-1" : "p-1.5"} ${open ? "bg-accent" : ""}`}
      >
        <ExternalLink className={compact ? "size-4" : "size-5"} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border-3 border-ink bg-card py-1 shadow-pop-sm"
        >
          {list.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  handOff([file, ...also], cues);
                  navigate(`/${t.id}`);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <t.icon className="size-4 shrink-0" aria-hidden />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
