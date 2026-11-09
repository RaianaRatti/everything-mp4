import { Search, Upload, X } from "lucide-react";
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

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-5 py-12 sm:px-8 sm:py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl leading-tight sm:text-5xl">everything-mp4</h1>
            <p className="text-ink-2">Video tools that run in your browser.</p>
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

        {dropped && (
          <section className="space-y-3 rounded-lg border-2 border-ink bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p>
                {kind
                  ? `you dropped ${extension(dropped.name) ? `a ${extension(dropped.name).toUpperCase()}` : "a file"}: pick a tool`
                  : `${dropped.name} isn't a file these tools take.`}
              </p>
              <button type="button" aria-label="Dismiss" onClick={() => setDropped(null)} className="rounded-sm p-1 hover:bg-accent">
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
    </div>
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
        <span className="flex size-9 items-center justify-center rounded-md bg-accent">
          <Icon className="size-5 text-ink" aria-hidden />
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
      <rect
        x="3"
        y="6"
        width="26"
        height="20"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="2"
      />
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
