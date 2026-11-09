/** An error whose message is written for people and can be shown as is. */
export class FriendlyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FriendlyError";
  }
}

/** A message to show for any error: friendly ones as they are, common browser errors explained. */
export function friendlyMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof FriendlyError) return err.message;
  if (err instanceof DOMException) {
    if (err.name === "QuotaExceededError") {
      return "There isn't enough storage space on this device. Free some space and try again.";
    }
    if (err.name === "NotAllowedError") return "The browser didn't allow that. Try again.";
    if (err.name === "NotReadableError")
      return "Couldn't read that file. It may have been moved or deleted; pick it again.";
  }
  if (err instanceof RangeError && /memory|allocation|array buffer/i.test(err.message)) {
    return "This device ran out of memory. Try a shorter part, a smaller size, or close other tabs.";
  }
  const text = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
    return "A download failed. Check your internet connection and try again.";
  }
  if (/quota|no space|disk full/i.test(text)) {
    return "There isn't enough storage space on this device. Free some space and try again.";
  }
  if (/out of memory|cannot allocate|oom/i.test(text)) {
    return "This device ran out of memory. Try a shorter part, a smaller size, or close other tabs.";
  }
  return fallback;
}

/** An error the UI has already explained elsewhere, so it isn't listed again. */
export class HandledError extends Error {
  constructor(message = "handled") {
    super(message);
    this.name = "HandledError";
  }
}
