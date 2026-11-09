import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACCENTS, useAccent } from "../lib/accent";
import { Downloads } from "./Downloads";
import { Licenses } from "./Licenses";

/** Top-right gear that opens a small picker for the UI highlight color. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute top-3 right-3 z-30">
      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute top-full right-0 mt-2 w-64 rounded-lg border-3 border-ink bg-card p-3 shadow-pop"
        >
          <p className="mb-3 text-xs tracking-wide text-ink-3 uppercase">highlight color</p>
          <div role="radiogroup" aria-label="Highlight color" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={accent === a.id}
                aria-label={a.label}
                title={a.label}
                data-accent={a.id}
                onClick={() => setAccent(a.id)}
                className={`size-7 rounded-full border-2 border-ink bg-accent ${
                  accent === a.id
                    ? "outline-2 outline-offset-2 outline-ink"
                    : "hover:-translate-y-0.5"
                }`}
              />
            ))}
          </div>
          <div className="mt-4 border-t-2 border-ink pt-3">
            <Downloads />
          </div>
          <div className="mt-4 border-t-2 border-ink pt-3">
            <Licenses />
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center transition-transform hover:rotate-45"
      >
        <Settings className="size-5" />
      </button>
    </div>
  );
}
