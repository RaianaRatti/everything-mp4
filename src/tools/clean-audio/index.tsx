import { useState } from "react";
import { BlobPreview } from "../../components/ExportDialog";
import { EnginePage, Player, usePlayer } from "../../components/EnginePage";
import { Button, Checkbox, Field, PanelSection, Segmented, Select } from "../../components/ui";
import { audioCodecFor, mimeFor, sameExtension } from "../../lib/ffmpeg/edit";
import { outputName } from "../../lib/files";
import type { MediaFile } from "../../lib/mediaFiles";

type Loudness = "off" | "-14" | "-16" | "-23" | "custom";
type Eq = "none" | "voice" | "bass" | "rumble";

const EQ: Record<Eq, string> = {
  none: "",
  voice: "highpass=f=80,equalizer=f=3000:t=q:w=1:g=4",
  bass: "bass=g=6",
  rumble: "highpass=f=100",
};

export default function CleanAudio() {
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [denoise, setDenoise] = useState(true);
  const [strength, setStrength] = useState(12);
  const [hum, setHum] = useState<"off" | "50" | "60">("off");
  const [loudness, setLoudness] = useState<Loudness>("-16");
  const [custom, setCustom] = useState(-18);
  const [eq, setEq] = useState<Eq>("none");
  const player = usePlayer();

  const info = media?.info;
  const isVideo = !!info?.video.length;
  const ext = media ? (isVideo ? sameExtension(media) : "m4a") : "mp4";
  const target = loudness === "custom" ? custom : Number(loudness);

  const oneClick = () => {
    setDenoise(true);
    setStrength(12);
    setHum("off");
    setLoudness("-16");
    setEq("voice");
  };

  const chain = [
    hum !== "off"
      ? [1, 2, 3].map((k) => `bandreject=f=${Number(hum) * k}:width_type=h:w=4`).join(",")
      : "",
    denoise ? `afftdn=nr=${strength}:nf=-40` : "",
    EQ[eq],
    loudness !== "off" ? `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=summary` : "",
  ]
    .filter(Boolean)
    .join(",");

  const settings = media && (
    <>
      <PanelSection>
        <Button variant="primary" className="w-full" onClick={oneClick}>
          make it sound better
        </Button>
        <p className="text-xs text-ink-3">Reduces noise, makes voices clearer and evens out the volume.</p>
      </PanelSection>
      <PanelSection title="clean up">
        <Checkbox checked={denoise} onChange={setDenoise} label="reduce background noise" />
        {denoise && (
          <Field label={`strength: ${strength}`}>
            <input
              type="range"
              min={3}
              max={40}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-full accent-black"
              aria-label="Noise reduction strength"
            />
          </Field>
        )}
        <Field label="remove hum">
          <Segmented
            label="Remove hum"
            value={hum}
            onChange={setHum}
            options={[
              { value: "off", label: "off" },
              { value: "50", label: "50 Hz" },
              { value: "60", label: "60 Hz" },
            ]}
          />
        </Field>
        <Field label="even out the volume">
          <Select
            label="Loudness"
            value={loudness}
            onChange={setLoudness}
            options={[
              { value: "off", label: "off" },
              { value: "-14", label: "streaming (YouTube, Spotify)" },
              { value: "-16", label: "podcast" },
              { value: "-23", label: "broadcast (TV)" },
              { value: "custom", label: "custom" },
            ]}
          />
        </Field>
        {loudness === "custom" && (
          <Field label={`${custom} LUFS`}>
            <input
              type="range"
              min={-30}
              max={-8}
              value={custom}
              onChange={(e) => setCustom(Number(e.target.value))}
              className="w-full accent-black"
              aria-label="Target loudness in LUFS"
            />
          </Field>
        )}
        <Field label="tone">
          <Select
            label="Tone"
            value={eq}
            onChange={setEq}
            options={[
              { value: "none", label: "unchanged" },
              { value: "voice", label: "voice clarity" },
              { value: "bass", label: "bass boost" },
              { value: "rumble", label: "remove rumble" },
            ]}
          />
        </Field>
      </PanelSection>
    </>
  );

  return (
    <EnginePage
      toolId="clean-audio"
      subtitle="Reduce background noise, even out volume"
      accept={["video", "audio"]}
      media={media ? [media] : []}
      onMedia={(files) => files[0] && setMedia(files[0])}
      settings={settings}
      action="clean up"
      running="cleaning up the sound…"
      disabled={
        (!info?.audio.length && "This file has no sound.") || (!chain && "Turn something on first.")
      }
      renderResult={(result) => (
        <div className="space-y-3">
          <p className="text-xs tracking-wide text-ink-3 uppercase">before</p>
          <BlobPreview blob={media!.file} />
          <p className="text-xs tracking-wide text-ink-3 uppercase">after</p>
          {result.files[0] && <BlobPreview blob={result.files[0].blob} />}
        </div>
      )}
      jobs={() => [
        {
          duration: info!.duration,
          mime: isVideo ? mimeFor(ext) : "audio/mp4",
          name: outputName(media!.file.name, "clean", ext),
          args: ([input]) => [
            "-i",
            input!,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0",
            "-af",
            `${chain},aresample=48000`,
            "-c:v",
            "copy",
            ...audioCodecFor(ext),
            `/out/clean.${ext}`,
          ],
          notes: (log) => {
            const input = log.join("\n").match(/Input Integrated:\s*(-?[\d.]+)/);
            const output = log.join("\n").match(/Output Integrated:\s*(-?[\d.]+)/);
            return input && output
              ? [`Loudness: ${input[1]} LUFS before, ${output[1]} LUFS after.`]
              : [];
          },
        },
      ]}
    >
      {media && <Player media={media} player={player} onRemove={() => setMedia(null)} />}
    </EnginePage>
  );
}
