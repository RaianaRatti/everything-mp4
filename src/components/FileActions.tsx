import { Trash2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

/**
 * The small "replace" or "add" button a tool hands down to its preview, so it can sit in the
 * preview's corner next to the bin instead of being a big box under it.
 */
export const FileActionsContext = createContext<ReactNode>(null);

export const roundButton =
  "flex size-9 items-center justify-center rounded-full border-2 border-ink bg-card shadow-pop-sm hover:bg-accent disabled:opacity-50";

/** The corner buttons of a chosen file: replace/add (from the tool) and remove. */
export function FileActions({
  onRemove,
  className = "",
}: {
  onRemove?: () => void;
  className?: string;
}) {
  const extra = useContext(FileActionsContext);
  if (!extra && !onRemove) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {extra}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          title="Remove"
          className={`${roundButton} hover:bg-red-50 hover:text-red-700`}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
