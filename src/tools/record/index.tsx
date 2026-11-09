import { Circle, Mic, MicOff, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { BlobPreview } from "../../components/ExportDialog";
import { OpenIn } from "../../components/OpenIn";
import { ActionButton, ToolLayout } from "../../components/ToolLayout";
import { Button, Checkbox, Field, PanelSection, Select } from "../../components/ui";
import { friendlyMessage } from "../../lib/errors";
import { downloadBlob } from "../../lib/files";
import { handOff } from "../../lib/handoff";
import { formatTime } from "../../lib/time";

type Mode = "screen" | "camera" | "both" | "voice";
type Corner = "br" | "bl" | "tr" | "tl";

const PART_FILE = "recording.part";

function pickMime(audioOnly: boolean): string {
  const list = audioOnly
    ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
    : ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Writes the recording to the browser's private storage as it goes, so a crash doesn't lose it. */
async function openPartFile(): Promise<FileSystemWritableFileStream | null> {
  try {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle(PART_FILE, { create: true });
    return await handle.createWritable();
  } catch {
    return null;
  }
}

async function leftover(): Promise<File | null> {
  try {
    const dir = await navigator.storage.getDirectory();
    const file = await (await dir.getFileHandle(PART_FILE)).getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

async function clearPart() {
  try {
    await (await navigator.storage.getDirectory()).removeEntry(PART_FILE);
  } catch {
    // Nothing saved.
  }
}

export default function Record() {
  const [mode, setMode] = useState<Mode>("screen");
  const [mic, setMic] = useState(true);
  const [corner, setCorner] = useState<Corner>("br");
  const [bubble, setBubble] = useState(22);
  const [state, setState] = useState<"idle" | "countdown" | "recording" | "paused">("idle");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<File | null>(null);
  const [muted, setMuted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const micGainRef = useRef<GainNode | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const session = useRef<{
    recorder: MediaRecorder;
    streams: MediaStream[];
    stop: () => void;
    started: number;
    pausedFor: number;
    pausedAt: number | null;
  } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void leftover().then((f) => f && setRecovered(f));
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => {
      const s = session.current;
      if (s) setElapsed((performance.now() - s.started - s.pausedFor) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [state]);

  const getStreams = async () => {
    const streams: MediaStream[] = [];
    const wantsScreen = mode === "screen" || mode === "both";
    const wantsCamera = mode === "camera" || mode === "both";
    if (wantsScreen)
      streams.push(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
    if (wantsCamera)
      streams.push(await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }));
    if (mic || mode === "voice") streams.push(await navigator.mediaDevices.getUserMedia({ audio: true }));
    return streams;
  };

  const start = async () => {
    setError(null);
    setResult(null);
    setMuted(false);
    // Made right away, while the click still counts: an audio context made later (after the
    // permission prompts) can start suspended and record silence.
    const ctx = new AudioContext();
    let streams: MediaStream[] = [];
    try {
      streams = await getStreams();
      await ctx.resume();
    } catch (err) {
      void ctx.close();
      setError(friendlyMessage(err, "Couldn't start recording. Allow access when the browser asks."));
      return;
    }
    const cleanups: (() => void)[] = [];

    // Mix every sound (screen and microphone) into one track, and drive the level meter. The
    // microphone goes through its own volume control so it can be muted.
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const micGain = ctx.createGain();
    micGain.connect(dest);
    micGain.connect(analyser);
    micGainRef.current = micGain;
    let hasAudio = false;
    let hasMic = false;
    for (const s of streams) {
      if (!s.getAudioTracks().length) continue;
      const src = ctx.createMediaStreamSource(s);
      // Only the microphone's stream has sound and no picture.
      if (!s.getVideoTracks().length) {
        src.connect(micGain);
        hasMic = true;
      } else {
        src.connect(dest);
        src.connect(analyser);
      }
      hasAudio = true;
    }
    setMicOn(hasMic);
    const levels = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(levels);
      let peak = 0;
      for (const v of levels) peak = Math.max(peak, Math.abs(v - 128) / 128);
      if (meter.current) meter.current.style.width = `${Math.min(100, peak * 140)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    cleanups.push(() => cancelAnimationFrame(raf), () => void ctx.close());

    let videoTrack: MediaStreamTrack | null = null;
    const screen = streams.find((s) => s.getVideoTracks()[0]?.getSettings().displaySurface);
    const camera = streams.find((s) => s.getVideoTracks().length && s !== screen);
    if (mode === "both" && screen && camera) {
      // Draw the screen with the webcam as a round bubble in a corner.
      const sv = Object.assign(document.createElement("video"), { srcObject: screen, muted: true });
      const cv = Object.assign(document.createElement("video"), { srcObject: camera, muted: true });
      await Promise.all([sv.play(), cv.play()]);
      const canvas = document.createElement("canvas");
      const g = canvas.getContext("2d")!;
      let draw = 0;
      const frame = () => {
        canvas.width = sv.videoWidth || 1280;
        canvas.height = sv.videoHeight || 720;
        g.drawImage(sv, 0, 0, canvas.width, canvas.height);
        const d = (bubble / 100) * canvas.height;
        const m = canvas.height * 0.03;
        const x = corner.includes("r") ? canvas.width - d - m : m;
        const y = corner.includes("b") ? canvas.height - d - m : m;
        g.save();
        g.beginPath();
        g.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
        g.clip();
        const s = Math.max(d / cv.videoWidth, d / cv.videoHeight) || 1;
        g.drawImage(cv, x + d / 2 - (cv.videoWidth * s) / 2, y + d / 2 - (cv.videoHeight * s) / 2, cv.videoWidth * s, cv.videoHeight * s);
        g.restore();
        draw = requestAnimationFrame(frame);
      };
      frame();
      cleanups.push(() => cancelAnimationFrame(draw));
      videoTrack = canvas.captureStream(30).getVideoTracks()[0] ?? null;
    } else {
      videoTrack = (screen ?? camera)?.getVideoTracks()[0] ?? null;
    }

    const tracks = [...(videoTrack ? [videoTrack] : []), ...(hasAudio ? dest.stream.getAudioTracks() : [])];
    const out = new MediaStream(tracks);
    if (live.current) live.current.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;

    setState("countdown");
    for (const n of [3, 2, 1]) {
      setCount(n);
      await new Promise((r) => setTimeout(r, 1000));
    }

    const mime = pickMime(mode === "voice");
    const recorder = new MediaRecorder(out, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const part = await openPartFile();
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      chunks.push(e.data);
      void part?.write(e.data).catch(() => {});
    };
    recorder.onstop = () => {
      cleanups.forEach((c) => c());
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      if (live.current) live.current.srcObject = null;
      const type = recorder.mimeType.split(";")[0] || "video/webm";
      const ext = type.includes("mp4") ? (mode === "voice" ? "m4a" : "mp4") : mode === "voice" ? "weba" : "webm";
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      setResult(new File(chunks, `${mode === "voice" ? "voice" : "recording"}-${stamp}.${ext}`, { type }));
      setState("idle");
      void part?.close().then(clearPart, clearPart);
    };
    // Stopping the share from the browser's own bar ends the recording too.
    videoTrack?.addEventListener("ended", () => recorder.state !== "inactive" && recorder.stop());
    recorder.start(1000);
    session.current = {
      recorder,
      streams,
      stop: () => recorder.stop(),
      started: performance.now(),
      pausedFor: 0,
      pausedAt: null,
    };
    setElapsed(0);
    setState("recording");
  };

  const pause = () => {
    const s = session.current;
    if (!s) return;
    if (state === "recording") {
      s.recorder.pause();
      s.pausedAt = performance.now();
      setState("paused");
    } else {
      s.recorder.resume();
      s.pausedFor += performance.now() - (s.pausedAt ?? performance.now());
      s.pausedAt = null;
      setState("recording");
    }
  };

  const busy = state !== "idle";
  const sidebar = (
    <>
      <div className="divide-y divide-line rounded-lg border-2 border-ink bg-card">
        <PanelSection title="record">
          <Select
            label="What to record"
            value={mode}
            onChange={setMode}
            options={[
              { value: "screen", label: "screen, window or tab" },
              { value: "camera", label: "webcam" },
              { value: "both", label: "screen + webcam bubble" },
              { value: "voice", label: "voice only" },
            ]}
          />
          {mode !== "voice" && <Checkbox checked={mic} onChange={setMic} label="microphone" />}
          {mode === "both" && (
            <>
              <Field label="bubble corner">
                <Select
                  label="Bubble corner"
                  value={corner}
                  onChange={setCorner}
                  options={[
                    { value: "br", label: "bottom right" },
                    { value: "bl", label: "bottom left" },
                    { value: "tr", label: "top right" },
                    { value: "tl", label: "top left" },
                  ]}
                />
              </Field>
              <Field label={`bubble size: ${bubble}%`}>
                <input
                  type="range"
                  min={10}
                  max={45}
                  value={bubble}
                  onChange={(e) => setBubble(Number(e.target.value))}
                  className="w-full accent-black"
                  aria-label="Bubble size"
                />
              </Field>
            </>
          )}
          {mode !== "camera" && mode !== "voice" && (
            <p className="text-xs text-ink-3">
              To include a tab's or the computer's sound, tick "share audio" when the browser asks.
            </p>
          )}
        </PanelSection>
      </div>
      {!busy && (
        <ActionButton onClick={() => void start()}>
          start recording
        </ActionButton>
      )}
    </>
  );

  return (
    <ToolLayout toolId="record" sidebar={sidebar}>
      {recovered && !busy && !result && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border-2 border-ink bg-paper-2 p-3 text-sm">
          A recording from last time didn't finish.
          <Button onClick={() => downloadBlob(recovered, "recovered-recording.webm")}>save it</Button>
          <Button
            variant="ghost"
            onClick={() => {
              void clearPart();
              setRecovered(null);
            }}
          >
            discard
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className={`relative overflow-hidden rounded-md border-2 border-ink bg-black ${busy && mode !== "voice" ? "" : "hidden"}`}>
        <video ref={live} autoPlay muted playsInline className="max-h-[50vh] w-full" />
        {state === "countdown" && (
          <p className="absolute inset-0 flex items-center justify-center text-8xl text-white">{count}</p>
        )}
      </div>
      {busy && (
        <div className="space-y-3 rounded-lg border-2 border-ink bg-card p-4">
          {mode === "voice" && state === "countdown" && <p className="text-5xl">{count}</p>}
          <p className="flex items-center gap-2 text-2xl">
            <Circle className={`size-4 fill-red-600 text-red-600 ${state === "recording" ? "animate-pulse" : ""}`} />
            {formatTime(elapsed, 0)} {state === "paused" && "(paused)"}
          </p>
          <div className="h-3 overflow-hidden rounded-sm border-2 border-ink bg-paper-3" aria-label="Sound level">
            <div ref={meter} className="h-full bg-accent" style={{ width: 0 }} />
          </div>
          {state !== "countdown" && (
            <div className="flex gap-2">
              <Button onClick={pause}>
                {state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                {state === "paused" ? "resume" : "pause"}
              </Button>
              {micOn && (
                <Button
                  aria-pressed={muted}
                  onClick={() => {
                    const next = !muted;
                    if (micGainRef.current) micGainRef.current.gain.value = next ? 0 : 1;
                    setMuted(next);
                  }}
                >
                  {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  {muted ? "unmute mic" : "mute mic"}
                </Button>
              )}
              <Button variant="primary" onClick={() => session.current?.stop()}>
                <Square className="size-4" /> stop
              </Button>
            </div>
          )}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <BlobPreview blob={result} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => downloadBlob(result, result.name)}>
              download {result.name}
            </Button>
            <Button
              onClick={() => {
                handOff([result]);
                navigate("/trim");
              }}
            >
              trim it
            </Button>
            <OpenIn file={result} exclude="record" />
          </div>
        </div>
      )}
      {!busy && !result && (
        <p className="text-ink-2">
          Pick what to record on the right, then press start. You get a 3-second countdown.
        </p>
      )}
    </ToolLayout>
  );
}
