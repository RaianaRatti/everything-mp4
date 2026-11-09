import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "border-ink bg-ink text-paper shadow-pop-sm pop-press",
  secondary: "border-ink bg-card text-ink hover:bg-accent",
  ghost: "border-transparent text-ink hover:bg-accent",
  danger: "border-ink bg-card text-ink hover:border-red-600 hover:bg-red-50 hover:text-red-700",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md border-3 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:border-ink-3 disabled:bg-paper-2 disabled:text-ink-3 disabled:shadow-none ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 p-4">
      {title && <p className="text-xs tracking-wide text-ink-3 uppercase">{title}</p>}
      {children}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-2">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border-3 border-ink bg-card px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-ink";

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-md border-3 border-ink bg-card p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-sm px-2 py-1 text-sm ${
            value === o.value ? "bg-accent text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-black"
      />
      {label}
    </label>
  );
}

/** A folded "advanced" section for settings most people never need. */
export function Advanced({
  children,
  label = "advanced",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer list-none text-sm text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>{" "}
        {label}
      </summary>
      <div className="space-y-3">{children}</div>
    </details>
  );
}

/** A plain select from a list of options, optionally grouped. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: (Option<T> & { group?: string })[];
  label?: string;
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const render = (list: typeof options) =>
    list.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ));
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      className={inputClass}
    >
      {groups.length > 1
        ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {render(options.filter((o) => (o.group ?? "") === g))}
            </optgroup>
          ))
        : render(options)}
    </select>
  );
}
