import { create } from "zustand";

export const ACCENTS = [
  { id: "pink", label: "Baby pink" },
  { id: "blue", label: "Baby blue" },
  { id: "yellow", label: "Baby yellow" },
  { id: "green", label: "Baby green" },
  { id: "grey", label: "Grey" },
] as const;

export type Accent = (typeof ACCENTS)[number]["id"];

const KEY = "everything-mp4:accent";

function load(): Accent {
  try {
    const saved = localStorage.getItem(KEY);
    if (ACCENTS.some((a) => a.id === saved)) return saved as Accent;
  } catch {
    // Storage blocked (private mode etc.): fall back to the default.
  }
  return "pink";
}

function apply(accent: Accent) {
  document.documentElement.dataset.accent = accent;
}

export const useAccent = create<{ accent: Accent; setAccent: (accent: Accent) => void }>((set) => {
  const accent = load();
  apply(accent);
  return {
    accent,
    setAccent: (next) => {
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Not persisted; still applies for this session.
      }
      set({ accent: next });
    },
  };
});
