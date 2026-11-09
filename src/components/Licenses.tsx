/** Every runtime dependency and its license. Update this list when dependencies change. */
const LICENSES: [name: string, license: string][] = [
  ["react, react-dom", "MIT"],
  ["react-router", "MIT"],
  ["zustand", "MIT"],
  ["lucide-react", "ISC"],
  ["mediabunny + encoders", "MPL-2.0"],
  ["@ffmpeg/ffmpeg", "MIT"],
  ["@ffmpeg/core (video engine)", "GPL-2.0+"],
  ["@huggingface/transformers", "Apache-2.0"],
  ["onnxruntime-web", "MIT"],
  ["Whisper models", "MIT"],
  ["client-zip", "MIT"],
  ["Pixelify Sans", "OFL-1.1"],
];

/** The licenses section of the settings menu. */
export function Licenses() {
  return (
    <div className="space-y-2">
      <p className="text-xs tracking-wide text-ink-3 uppercase">licenses</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {LICENSES.map(([name, license]) => (
          <li key={name} className="flex justify-between gap-2">
            <span className="min-w-0 truncate" title={name}>
              {name}
            </span>
            <span className="shrink-0 text-ink-3">{license}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
