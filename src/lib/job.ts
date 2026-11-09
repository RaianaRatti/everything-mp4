import { useEffect } from "react";

const APP_NAME = "everything-mp4";

let baseTitle = APP_NAME;
let titleProgress: number | null = null;

function renderTitle() {
  document.title =
    titleProgress === null ? baseTitle : `${Math.floor(titleProgress * 100)}% · ${baseTitle}`;
}

/** Sets the browser tab title to "<title> · everything-mp4" (or just the app name). */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    baseTitle = title ? `${title} · ${APP_NAME}` : `${APP_NAME}: video tools in your browser`;
    renderTitle();
  }, [title]);
}

/**
 * While a long job runs: keeps the screen awake, warns before the tab is closed, and shows the
 * progress in the tab title so it can be watched from another tab.
 */
export function useJobGuards(active: boolean, fraction: number) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // The wake lock is dropped whenever the tab is hidden, so take it again when it's back.
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      if (released || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (released) void lock.release();
      } catch {
        // Not allowed (battery saver, iframe…): the job still runs, the screen may just dim.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      titleProgress = null;
      renderTitle();
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    titleProgress = Math.min(1, Math.max(0, fraction));
    renderTitle();
  }, [active, fraction]);
}

/** Thrown (as the abort reason) when the person cancels a job. */
export function canceled(): DOMException {
  return new DOMException("Canceled", "AbortError");
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
