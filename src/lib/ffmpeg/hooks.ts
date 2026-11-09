import { useCallback, useEffect, useRef, useState } from "react";
import { HandledError } from "../errors";
import { canEncodeAudioCodec, canEncodeVideoAt } from "../engine/capabilities";
import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  type AudioCodecId,
  type VideoCodecId,
} from "../engine/formats";
import { NeedsEngineError, inspectMedia, type MediaInfo } from "../engine/inspect";
import {
  engineSupport,
  isEngineCached,
  knownSupport,
  loadEngine,
  useEngine,
  type EngineSupport,
} from "./engine";
import { inspectWithEngine } from "./inspect";

/**
 * Starts the video engine by itself when it's needed and was downloaded before (no download, so
 * no need to ask). Returns its status.
 */
export function useEngineWhenNeeded(needed: boolean) {
  const status = useEngine((s) => s.status);
  useEffect(() => {
    if (!needed || status !== "idle") return;
    let live = true;
    void isEngineCached().then((cached) => {
      if (live && cached) void loadEngine().catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [needed, status]);
  return status;
}

/** What the engine can make: remembered from an earlier visit, or checked once it's running. */
export function useEngineSupport(): EngineSupport | null {
  const status = useEngine((s) => s.status);
  const [support, setSupport] = useState<EngineSupport | null>(() => knownSupport());
  useEffect(() => {
    if (support || status !== "ready") return;
    let live = true;
    void engineSupport().then(
      (s) => live && setSupport(s),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [support, status]);
  return support;
}

/**
 * Reads media files for a tool: with the browser when it can, otherwise with the video engine.
 * Files that need the engine before it's loaded wait in `waiting` (show an EnginePanel for them);
 * once it's ready they're read and handed to `onLoaded`.
 */
export function useMediaLoader(onLoaded: (items: { file: File; result: MediaInfo }[]) => void) {
  const [waiting, setWaiting] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const status = useEngine((s) => s.status);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });
  useEngineWhenNeeded(waiting.length > 0);

  const load = useCallback(async (file: File): Promise<MediaInfo> => {
    try {
      return await inspectMedia(file);
    } catch (err) {
      if (!(err instanceof NeedsEngineError)) throw err;
      if (useEngine.getState().status === "ready") return inspectWithEngine(file);
      setWaiting((w) => [...w, file]);
      throw new HandledError();
    }
  }, []);

  // Read the waiting files as soon as the engine is ready.
  useEffect(() => {
    if (status !== "ready" || !waiting.length) return;
    const files = waiting;
    let live = true;
    void Promise.allSettled(
      files.map(async (file) => ({ file, result: await inspectWithEngine(file) })),
    ).then((results) => {
      if (!live) return;
      setWaiting((w) => w.filter((f) => !files.includes(f)));
      const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.find((r) => r.status === "rejected");
      setError(failed ? String((failed.reason as Error).message) : null);
      if (ok.length) onLoadedRef.current(ok);
    });
    return () => {
      live = false;
    };
  }, [status, waiting]);

  return { load, waiting, error, clearWaiting: () => setWaiting([]) };
}

export interface Abilities {
  browserVideo: Partial<Record<VideoCodecId, boolean>>;
  browserAudio: Partial<Record<AudioCodecId, boolean>>;
  engine: EngineSupport | null;
}

/**
 * Which codecs this browser can encode (checked once at 1080p) plus what the video engine can
 * make. Null until the browser checks finish.
 */
export function useAbilities(): Abilities | null {
  const engine = useEngineSupport();
  const [browser, setBrowser] = useState<Omit<Abilities, "engine"> | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const videoIds = Object.keys(VIDEO_CODECS) as VideoCodecId[];
      const audioIds = Object.keys(AUDIO_CODECS) as AudioCodecId[];
      const [v, a] = await Promise.all([
        Promise.all(videoIds.map((c) => canEncodeVideoAt(c, 1920, 1080))),
        Promise.all(audioIds.map((c) => canEncodeAudioCodec(c))),
      ]);
      if (!live) return;
      setBrowser({
        browserVideo: Object.fromEntries(videoIds.map((c, i) => [c, v[i]!])),
        browserAudio: Object.fromEntries(audioIds.map((c, i) => [c, a[i]!])),
      });
    })();
    return () => {
      live = false;
    };
  }, []);
  return browser ? { ...browser, engine } : null;
}
