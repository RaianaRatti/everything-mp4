import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { HandledError, friendlyMessage } from "../lib/errors";
import { takeHandoff } from "../lib/handoff";
import { roundButton } from "./FileActions";
import { Button } from "./ui";
import { acceptFor, describeKinds, fileKind, type FileKind } from "../lib/files";

export interface Loaded<T> {
  file: File;
  result: T;
}

/**
 * A box to drop or pick files on. Each file is checked against the kinds the tool takes, then read
 * with `load` (which throws for files it can't use); "reading…" shows meanwhile and problems are
 * listed underneath. `onLoad` gets the files that worked, in the order they were given.
 */
export function FileDrop<T>({
  accept,
  load,
  onLoad,
  multiple = false,
  title,
  subtitle,
  compact = false,
  disabled = false,
}: {
  accept: FileKind[];
  load: (file: File) => Promise<T>;
  onLoad: (items: Loaded<T>[]) => void;
  multiple?: boolean;
  title?: string;
  subtitle?: ReactNode;
  /** A small round "add" (or "replace") button, for a tool that already has files. */
  compact?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const what = describeKinds(accept);

  const take = async (picked: File[]) => {
    if (disabled || !picked.length) return;
    const files = multiple ? picked : picked.slice(0, 1);
    const usable = files.filter((f) => {
      const kind = fileKind(f);
      return kind !== null && accept.includes(kind);
    });
    const problems = files
      .filter((f) => !usable.includes(f))
      .map((f) => `${f.name} doesn't look like a ${what}.`);
    setErrors(problems);
    if (!usable.length) return;

    setReading((r) => [...r, ...usable.map((f) => f.name)]);
    const results = await Promise.all(
      usable.map(async (file): Promise<Loaded<T> | null> => {
        try {
          return { file, result: await load(file) };
        } catch (err) {
          if (err instanceof HandledError) return null;
          console.error(err);
          setErrors((prev) => [...prev, friendlyMessage(err, `Couldn't read ${file.name}.`)]);
          return null;
        } finally {
          setReading((r) => {
            const i = r.indexOf(file.name);
            return i < 0 ? r : r.toSpliced(i, 1);
          });
        }
      }),
    );
    const ok = results.filter((r): r is Loaded<T> => r !== null);
    if (ok.length) onLoad(ok);
  };

  // A file sent from another tool arrives as if it had been dropped here.
  const takeRef = useRef(take);
  useEffect(() => {
    takeRef.current = take;
  });
  useEffect(() => {
    const files = takeHandoff(accept);
    if (files.length) void Promise.resolve().then(() => takeRef.current(files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropProps = {
    onDragOver: (e: ReactDragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      void take([...e.dataTransfer.files]);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={acceptFor(accept)}
      multiple={multiple}
      hidden
      onChange={(e) => {
        void take([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );

  const status = (
    <>
      {reading.map((name, i) => (
        <p key={`${name}-${i}`} className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          reading {name}…
        </p>
      ))}
      {errors.map((error) => (
        <p key={error} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ))}
    </>
  );

  if (compact) {
    const label = title ?? (multiple ? `add ${what}s` : `replace ${what}`);
    return (
      <span className="relative inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          {...dropProps}
          aria-label={label}
          title={label}
          className={`${roundButton} ${over ? "bg-accent" : ""}`}
        >
          {reading.length ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : multiple ? (
            <Plus className="size-4" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
        </button>
        {picker}
        {errors.length > 0 && (
          <div
            role="alert"
            className="absolute top-full right-0 z-30 mt-1 w-64 space-y-1 rounded-md border-2 border-ink bg-card p-2 text-xs text-red-700"
          >
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div
        {...dropProps}
        className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors sm:py-20 ${
          over ? "border-ink bg-accent" : "border-ink-3/50 bg-card"
        }`}
      >
        <p className="text-2xl">
          {title ?? (multiple ? `drop ${what}s here` : `drop a ${what} here`)}
        </p>
        {subtitle && <p className="max-w-md text-sm text-ink-2">{subtitle}</p>}
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="pop-press rounded-md border-2 border-ink bg-ink px-5 py-2.5 text-paper"
        >
          {multiple ? "choose files" : "choose file"}
        </button>
        {picker}
      </div>
      {status}
    </div>
  );
}

/**
 * A button that opens a file picker. It looks like the app's other buttons; `bare` leaves the
 * styling to `className` (for icon buttons).
 */
export function FilePickerButton({
  onFiles,
  accept,
  children,
  className = "",
  multiple = false,
  bare = false,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  bare?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      {bare ? (
        <button type="button" onClick={() => input.current?.click()} className={className}>
          {children}
        </button>
      ) : (
        <Button onClick={() => input.current?.click()} className={className}>
          {children}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
