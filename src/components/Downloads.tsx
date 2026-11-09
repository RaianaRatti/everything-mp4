import { useEffect, useState } from "react";
import { CACHE_NAME } from "../lib/ffmpeg/engine";
import { formatBytes } from "../lib/files";

/** The big optional downloads kept on this device, with their sizes and a delete button each. */
const STORES = [
  { cache: CACHE_NAME, label: "video engine" },
  { cache: "transformers-cache", label: "speech models (auto captions)" },
];

async function cacheSize(name: string): Promise<number> {
  if (!(await caches.has(name))) return 0;
  const cache = await caches.open(name);
  let total = 0;
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const length = Number(res?.headers.get("content-length"));
    total += length > 0 ? length : ((await res?.blob())?.size ?? 0);
  }
  return total;
}

export function Downloads() {
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all(STORES.map((s) => cacheSize(s.cache).catch(() => 0))).then(
      (list) => live && setSizes(Object.fromEntries(STORES.map((s, i) => [s.cache, list[i]!]))),
    );
    return () => {
      live = false;
    };
  }, [version]);

  return (
    <div className="space-y-2">
      <p className="text-xs tracking-wide text-ink-3 uppercase">downloads</p>
      {STORES.map((s) => (
        <div key={s.cache} className="flex items-center justify-between gap-2 text-sm">
          <span>
            {s.label}
            <span className="block text-xs text-ink-3">
              {sizes ? (sizes[s.cache] ? formatBytes(sizes[s.cache]!) : "not downloaded") : "…"}
            </span>
          </span>
          {!!sizes?.[s.cache] && (
            <button
              type="button"
              onClick={() => void caches.delete(s.cache).then(() => setVersion((v) => v + 1))}
              className="rounded-md border-2 border-ink px-2 py-0.5 text-xs hover:bg-accent"
            >
              delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
