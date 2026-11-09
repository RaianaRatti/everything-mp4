import { useEffect } from "react";

/** Object URLs by blob, with how many mounted components use each. */
const urls = new Map<Blob, { url: string; users: number }>();

function urlFor(blob: Blob): string {
  let entry = urls.get(blob);
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), users: 0 };
    urls.set(blob, entry);
  }
  return entry.url;
}

/**
 * A URL for showing a file or blob in <video>, <img> etc. It's freed shortly after the last
 * component using it unmounts (the delay lets React's dev double-mount reuse it).
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = blob ? urlFor(blob) : null;
  useEffect(() => {
    if (!blob) return;
    urlFor(blob);
    const entry = urls.get(blob)!;
    entry.users++;
    return () => {
      entry.users--;
      setTimeout(() => {
        if (entry.users > 0 || urls.get(blob) !== entry) return;
        urls.delete(blob);
        URL.revokeObjectURL(entry.url);
      }, 1000);
    };
  }, [blob]);
  return url;
}
