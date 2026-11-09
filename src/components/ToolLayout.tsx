import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useDocumentTitle } from "../lib/job";
import { findTool } from "../tools/registry";

/**
 * The page frame every tool shares: a header with a back link and the tool's name, then the main
 * area. With a sidebar, the two sit side by side on wide screens (settings on the right), like
 * merge; without one, the content is centered.
 */
export function ToolLayout({
  toolId,
  sidebar,
  children,
}: {
  toolId: string;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  const tool = findTool(toolId);
  const label = tool?.label ?? toolId;
  const Icon = tool?.icon;
  useDocumentTitle(label);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-ink bg-card py-3 pr-14 pl-3 sm:pl-5">
        <Link to="/" className="rounded-md p-1.5 hover:bg-accent" aria-label="All tools">
          <ArrowLeft className="size-5" />
        </Link>
        {Icon && <Icon className="size-5" aria-hidden />}
        <h1 className="text-lg">{label}</h1>
      </header>

      {sidebar ? (
        <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-5">{children}</div>
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">{sidebar}</aside>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      )}
    </div>
  );
}

/** The big primary button at the bottom of a tool's sidebar ("export mp4", "convert"). */
export function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="pop-press w-full rounded-md border-2 border-ink bg-ink px-4 py-3 text-paper disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-paper-2 disabled:text-ink-3 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

/** The small print under the action button. */
/** A short note under a tool's main button. Renders nothing without children. */
export function PrivacyNote({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-xs leading-relaxed text-ink-3">{children}</p>;
}
