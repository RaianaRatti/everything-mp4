/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";

/**
 * Speech to text with Whisper (transformers.js), off the main thread. Audio arrives as 16 kHz mono
 * samples and is transcribed 30 seconds at a time, so long files work and progress is real.
 */

env.allowLocalModels = false;

export interface WhisperRequest {
  size: "tiny" | "base" | "small";
  language: string | null;
  translate: boolean;
  audio: Float32Array;
}

export type WhisperMessage =
  | { type: "download"; file: string; loaded: number; total: number }
  | { type: "progress"; fraction: number }
  | {
      type: "done";
      words: { start: number; end: number; text: string }[] | null;
      segments: { start: number; end: number; text: string }[];
    }
  | { type: "error"; message: string };

const RATE = 16000;
const WINDOW = 30 * RATE;

type Chunk = { text: string; timestamp: [number, number | null] };
type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: Chunk[] }>;

const post = (m: WhisperMessage) => postMessage(m);

async function load(size: string, wordLevel: boolean): Promise<Transcriber> {
  const gpu = "gpu" in navigator;
  const model = `onnx-community/whisper-${size}${wordLevel ? "_timestamped" : ""}`;
  const asr = await pipeline("automatic-speech-recognition", model, {
    device: gpu ? "webgpu" : "wasm",
    dtype: gpu ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.file)
        post({ type: "download", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
    },
  });
  return asr as unknown as Transcriber;
}

self.onmessage = async (e: MessageEvent<WhisperRequest>) => {
  const { size, language, translate, audio } = e.data;
  try {
    // Word timings need a specially exported model; fall back to whole lines without it.
    let wordLevel = true;
    let asr: Transcriber;
    try {
      asr = await load(size, true);
    } catch {
      wordLevel = false;
      asr = await load(size, false);
    }
    const words: { start: number; end: number; text: string }[] = [];
    const segments: { start: number; end: number; text: string }[] = [];
    for (let at = 0; at < audio.length; at += WINDOW) {
      const piece = audio.subarray(at, Math.min(audio.length, at + WINDOW));
      const offset = at / RATE;
      const out = await asr(piece, {
        return_timestamps: wordLevel ? "word" : true,
        language: language ?? undefined,
        task: translate ? "translate" : "transcribe",
      });
      for (const c of out.chunks ?? []) {
        const start = offset + c.timestamp[0];
        const end = offset + (c.timestamp[1] ?? piece.length / RATE);
        const text = c.text.trim();
        if (!text) continue;
        (wordLevel ? words : segments).push({ start, end: Math.max(end, start + 0.05), text });
      }
      post({ type: "progress", fraction: Math.min(1, (at + WINDOW) / audio.length) });
    }
    post({ type: "done", words: wordLevel ? words : null, segments });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
