import { Play, Search, Upload, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { extension, fileKind } from "../lib/files";
import { handOff } from "../lib/handoff";
import { useDocumentTitle } from "../lib/job";
import { CATEGORIES, searchTools, tools, type Tool } from "../tools/registry";

export function Home() {
  useDocumentTitle(null);
  const [query, setQuery] = useState("");
  const results = searchTools(query);
  const searching = query.trim() !== "";
  const [dropped, setDropped] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const navigate = useNavigate();
  const kind = dropped ? fileKind(dropped) : null;
  const suggestions = kind ? tools.filter((t) => t.accepts.includes(kind)) : [];
  const open = (id: string) => {
    if (dropped) handOff([dropped]);
    navigate(`/${id}`);
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) setDropped(file);
      }}
    >
      {over && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-ink bg-accent/80 text-2xl">
          <Upload className="mr-3 size-6" /> drop a file to see what you can do with it
        </div>
      )}
      <header className="flex items-center gap-2.5 border-b border-ink bg-card py-4 pr-14 pl-5 sm:pl-8">
        <Logo />
        <span className="text-lg">everything-mp4</span>
      </header>

      <section className="relative border-b border-ink">
        <Dither />
        <div className="relative mx-auto grid w-full max-w-4xl items-center gap-10 px-5 pt-12 pb-24 sm:px-8 sm:pt-16 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl leading-tight sm:text-5xl">everything-mp4</h1>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
                {[`${tools.length} tools`, "files never leave your device", "no sign-up"].map(
                  (fact) => (
                    <li key={fact} className="flex items-center gap-2">
                      <span className="size-2 bg-accent" aria-hidden />
                      {fact}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <label className="relative block max-w-md">
              <span className="sr-only">Search tools</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                  if (e.key === "Enter" && searching && results[0]) navigate(`/${results[0].id}`);
                }}
                placeholder="search tools: compress, mp3, gif…"
                className="w-full rounded-md border-2 border-ink bg-card py-2.5 pr-10 pl-9 focus:outline-2 focus:outline-offset-2 focus:outline-ink [&::-webkit-search-cancel-button]:hidden"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              )}
            </label>
          </div>
          <Player />
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-5 py-12 sm:px-8 sm:py-14">
        {dropped && (
          <section className="space-y-3 rounded-lg border-2 border-ink bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p>
                {kind
                  ? `you dropped ${extension(dropped.name) ? `a ${extension(dropped.name).toUpperCase()}` : "a file"}: pick a tool`
                  : `${dropped.name} isn't a file these tools take.`}
              </p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setDropped(null)}
                className="rounded-sm p-1 hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => open(t.id)}
                  className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {searching ? (
          <section aria-label="Search results">
            {results.length ? (
              <ToolGrid list={results} />
            ) : (
              <p className="text-ink-2">No tool matches “{query.trim()}”. Try another word.</p>
            )}
          </section>
        ) : (
          CATEGORIES.map((category, c) => {
            const list = tools.filter((tool) => tool.category === category);
            if (!list.length) return null;
            return (
              <section key={category} aria-labelledby={`cat-${c}`}>
                <h2
                  id={`cat-${c}`}
                  className="mb-4 flex items-center gap-2.5 text-sm text-ink-2 lowercase"
                >
                  <span className="size-2 bg-accent" aria-hidden />
                  {category}
                  <span className="h-px flex-1 bg-line" aria-hidden />
                </h2>
                <ToolGrid list={list} />
              </section>
            );
          })
        )}
      </main>

      <footer className="flex items-center gap-2.5 border-t border-ink bg-card py-4 pr-14 pl-5 sm:pl-8">
        <Logo />
        <span className="text-lg">everything-mp4</span>
      </footer>
    </div>
  );
}

/** A little pixel video player: just decoration, it doesn't do anything. */
function Player() {
  return (
    <div className="w-full max-w-md border-2 border-ink bg-card select-none">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-3 py-2 text-xs">
        <span className="truncate">untitled.mp4</span>
        <span className="flex shrink-0 gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 border-2 border-ink" />
          ))}
        </span>
      </div>
      <div className="relative aspect-video overflow-hidden bg-paper-2">
        <Scene />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <p className="flex flex-col items-center gap-1 border-2 border-ink bg-card px-4 py-2.5 text-center">
            runs in your browser
            <span className="text-xs text-ink-3">convert · trim · compress · more</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t-2 border-ink px-3 py-2 text-xs" aria-hidden>
        <Play className="size-3.5 fill-ink" />
        <span className="relative h-2.5 flex-1 border-2 border-ink">
          <span className="animate-scrub absolute inset-y-0 left-0 border-r-2 border-ink bg-accent" />
        </span>
        <span className="text-ink-3 tabular-nums">--:--</span>
      </div>
    </div>
  );
}

/** Pixel dither along the hero's bottom edge: 4px squares that thicken toward the border. */
function Dither() {
  // One 16px row per density: 1/8, 1/4, 1/2, 3/4.
  const rows = [
    [
      [0, 0],
      [8, 8],
    ],
    [
      [0, 0],
      [8, 0],
      [4, 8],
      [12, 8],
    ],
    [
      [0, 0],
      [8, 0],
      [4, 4],
      [12, 4],
      [0, 8],
      [8, 8],
      [4, 12],
      [12, 12],
    ],
    [
      [0, 0],
      [4, 0],
      [8, 0],
      [12, 0],
      [4, 4],
      [12, 4],
      [0, 8],
      [4, 8],
      [8, 8],
      [12, 8],
      [4, 12],
      [12, 12],
    ],
  ];
  return (
    <svg
      className="pixel pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-accent"
      aria-hidden
    >
      <defs>
        {rows.map((squares, i) => (
          <pattern key={i} id={`dither-${i}`} width="16" height="16" patternUnits="userSpaceOnUse">
            {squares.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill="currentColor" />
            ))}
          </pattern>
        ))}
      </defs>
      {rows.map((_, i) => (
        <rect key={i} y={i * 16} width="100%" height="16" fill={`url(#dither-${i})`} />
      ))}
    </svg>
  );
}

/** Placeholder picture for the drop screen, drawn on a 64×36 pixel grid. */
function Scene() {
  const outline = {
    stroke: "currentColor",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke",
  } as const;
  return (
    <svg
      viewBox="0 0 64 36"
      preserveAspectRatio="xMidYMid slice"
      className="pixel absolute inset-0 size-full text-ink"
      aria-hidden
    >
      <path
        d="M52 4h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1V6h1V5h1z"
        fill="var(--color-accent)"
        {...outline}
      />
      <path
        d="M-1 37V26H6V23H10V20H14V17H18V20H22V23H26V25H30V22H34V19H38V16H42V13H46V16H50V19H54V22H58V25H65V37Z"
        fill="var(--color-card)"
        {...outline}
      />
      <path
        d="M-1 37V30H8V28H16V27H26V28H34V30H40V29H48V27H56V28H65V37Z"
        fill="var(--color-accent)"
        {...outline}
      />
    </svg>
  );
}

/** Tools are numbered in the order Home shows them by category, so numbers don't jump around. */
const numbered = CATEGORIES.flatMap((c) => tools.filter((t) => t.category === c));

function ToolGrid({ list }: { list: Tool[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {list.map((tool) => (
        <li key={tool.id}>
          <ToolCard tool={tool} number={numbered.indexOf(tool) + 1} />
        </li>
      ))}
    </ul>
  );
}

function ToolCard({ tool, number }: { tool: Tool; number: number }) {
  const Icon = tool.icon;
  return (
    <Link
      to={`/${tool.id}`}
      title={tool.description}
      className="group pop-press flex h-32 flex-col justify-between rounded-lg border-2 border-ink bg-card p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-md bg-accent group-hover:bg-ink group-focus-visible:bg-ink">
          <Icon
            className="size-5 text-ink group-hover:text-accent group-focus-visible:text-accent"
            aria-hidden
          />
        </span>
        <span className="text-xs text-ink-3">{String(number).padStart(2, "0")}</span>
      </span>
      <span className="flex items-center justify-between gap-2 text-lg leading-tight">
        {tool.label}
        <span
          className="text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          ▶
        </span>
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="pixel size-6 shrink-0 text-ink" aria-hidden>
      <rect x="3" y="6" width="26" height="20" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <path
        d="M13 11.5v9l7.5-4.5z"
        fill="var(--color-accent)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
