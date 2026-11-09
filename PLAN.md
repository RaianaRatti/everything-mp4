# everything-mp4: build plan

The goal is one website with the **30 most useful video tools**: converting, compressing,
trimming, cropping, audio, text and watermarks, subtitles, recording and batch processing. All of
it runs in the browser, and nothing is uploaded. The existing **merge videos** tool stays.

This file is written for an AI coding agent. The user will repeatedly say **"do the next
section"**. The plan has **4 sections**, and each one is a short list of numbered **steps** (25 in
total). Aim to finish a whole section in one turn. If you truly run out of room, stop at a clean
point; the next "do the next section" continues the same section where you left off.

---

## How to work through this plan (read first, every time)

1. **Find where to start.** Look at the [Progress](#progress) list. The current section is the
   first one that still has unchecked steps (`- [ ]`). Start at its first unchecked step and work
   through the steps **in order**. Never start the following section in the same turn.
2. **Read before coding.** Read _Product principles_, _Architecture_, _Conventions_, the
   _Decisions log_ at the bottom, and each step before you build it. Then read the code the step
   touches. **The code is the source of truth.** If this plan disagrees with the code (because an
   earlier step deviated), follow the code and the Decisions log.
3. **Pick libraries sensibly.** Check a dependency's current version and license before adding
   it. Prefer permissive licenses and lazy-load anything heavy.
4. **Stop at a clean point.** Finish whole steps. If you must stop partway through a step, leave
   it unchecked. Don't register a tool on the home page until it works. Write in the Decisions log
   exactly what is done, so the next turn can pick up from there.
5. **A step is done when:**
   - every listed tool works when you try it;
   - `README.md` _Features_ describes the new tools in the same plain style as the existing text;
   - the step is ticked in Progress with the date, for example `- [x] 4. Convert (2026-11-10)`;
   - an entry is added to the **Decisions log**: what was built, shared code later steps should
     reuse, and any deviations from the plan.
6. **Basic checks before ending every turn:** `npm run typecheck`, `npm run lint`, `npm test` and
   `npm run build` pass. Add a small unit test only for tricky pure logic (time math, parsers,
   bitrate math). No end-to-end tests or test fixtures are needed.
7. **Don't commit or push** unless the user asks. The project is not a git repo yet.
8. **End your reply** with: which steps were finished, how to try the new tools, anything that
   needs the user's attention, and either "section N is done; next is section N+1" or "section N
   continues at step M".

---

## Product principles

- **Local only.** User media never leaves the device: no uploads and no analytics. The only
  network traffic is app assets and optional big downloads (the video engine and the speech
  model). Before an optional download, say how big it is, then cache it so it only downloads once.
- **Drop and go.** Every tool works with "drop a file → press one button" using sensible defaults.
  Advanced options go behind an "advanced" disclosure.
- **Plain language.** UI labels are lowercase and friendly, like the existing "merge videos" and
  "export mp4". Explain results ("smaller file, slightly blurrier"), not jargon.
- **Fastest correct path.** Copy without re-encoding when possible ("instant, no quality loss"),
  then use the browser's hardware encoder, then fall back to ffmpeg.wasm. Tell the user which is
  used.
- **Preview = export.** The live preview and the export share the same drawing code, as
  `src/lib/compose.ts` does today.
- **Fail helpfully.** When the browser can't do something, say so plainly and offer an
  alternative.
- **Stay legal.** No DRM circumvention and no site-specific downloaders (YouTube, TikTok and so on).
- **Works on a phone.** Layouts work from 360 px wide. Desktop is the main target.

---

## Architecture

**Stack:** Vite, React 19, TypeScript, react-router (lazy routes), zustand, Tailwind CSS 4
(tokens in `src/index.css`), lucide-react icons, mediabunny (reads, decodes, encodes and writes
video through the browser's WebCodecs), Vitest.

**Existing code:**

- `src/tools/registry.ts`: the tools shown on Home. Each tool's route is `/<id>`.
- `src/App.tsx`: the router.
- `src/routes/Home.tsx`, `src/routes/Merge.tsx`, `src/merge/*`: Home and the merge tool.
- `src/lib/export.ts`: merge's render pipeline (decode frames, draw them on a canvas, encode,
  mix audio).
- `src/lib/probe.ts`, `layout.ts`, `compose.ts`, `time.ts`, `accent.ts`: helpers.
- `src/components/ui.tsx`, `Dropzone.tsx`, `SettingsButton.tsx`: shared UI.

**Where new code goes:**

- `src/tools/<id>/`: one folder per tool.
- `src/components/`: shared UI (layout, drop zones, preview, timeline, export dialog, stage).
- `src/lib/`: shared logic, split into `engine/`, `ffmpeg/`, `audio/`, `gfx/`, `overlays/` and
  `subtitles/`.
- `src/workers/`: web workers for heavy work.

**Engines:**

1. **Copy (remux):** instant and lossless, when only the container, tracks, metadata or
   keyframe-aligned cut points change.
2. **mediabunny + WebCodecs:** the default for re-encoding. Fast and hardware accelerated. Handles
   MP4, MOV, WebM, MKV and the common audio formats.
3. **ffmpeg.wasm:** the fallback (step 3). Slower and about a 30 MB download, but handles older and
   professional formats (AVI, WMV, FLV, MPG, 3GP, ProRes…).

**The frame pipeline** (step 2) is shared by most tools. It decodes the video, lets the tool draw
on each frame (filters, text, watermark, blur, transitions), then encodes the result, copying the
audio when it hasn't changed.

---

## Conventions

- **Adding a tool:** create `src/tools/<id>/`, add a registry entry (label, one-sentence
  description, category, icon, search keywords), and use the shared layout, drop zone, preview,
  timeline and export dialog. Don't copy merge's versions. Add a README bullet.
- **Categories**, in order: `convert`, `edit`, `audio`, `look & overlays`, `subtitles`,
  `info & repair`, `create & batch`.
- **Style:** use the existing tokens and utilities (`paper`, `card`, `ink`, `accent`,
  `shadow-pop`, `pop-press`, `border-3 border-ink`), the Pixelify Sans font, and the playful, flat,
  high-contrast look. Labels are lowercase.
- **Accessibility:** anything draggable also has number inputs or arrow keys. Dialogs close on
  Escape.
- **Code:** strict TypeScript, short comments that explain _why_, matching the existing code.
  Long jobs can be canceled and show progress. Heavy work runs in a web worker when practical.
- **Output names:** `<input name>-<suffix>.<ext>`, for example `holiday-trimmed.mp4`.
- **Bundle size:** load ffmpeg and the speech model only when a tool needs them.

---

## Progress

### Section 1: foundations and conversion (6 tools)
- [x] 1. Shared tool framework (2026-11-08)
- [x] 2. Frame pipeline, big files, ZIP, and **media info** (2026-11-08)
- [x] 3. ffmpeg.wasm engine (2026-11-08)
- [x] 4. **Convert** (2026-11-08)
- [x] 5. **Compress** and **extract audio** (2026-11-08)
- [x] 6. **Video to GIF** and **frames** (2026-11-08)

### Section 2: editing (9 tools)
- [x] 7. Shared timeline and **trim** (2026-11-08)
- [x] 8. **Split** (2026-11-08)
- [x] 9. **Crop**, **resize**, **rotate** (2026-11-08)
- [x] 10. **Speed** and **reverse & loop** (2026-11-08)
- [x] 11. **Join** (2026-11-08)
- [x] 12. **Make for…** (platform sizes) (2026-11-08)

### Section 3: audio, look and overlays (8 tools)
- [x] 13. **Edit audio** (2026-11-08)
- [x] 14. **Clean up audio** and **remove silence** (2026-11-08)
- [x] 15. **Filters** (colors, looks, fades) (2026-11-08)
- [x] 16. **Add text** and **watermark** (2026-11-08)
- [x] 17. **Blur region** (2026-11-08)
- [x] 18. **Slideshow** (2026-11-08)

### Section 4: subtitles, info, record, batch, release (7 tools)
- [x] 19. **Subtitle editor** (edit, convert, resync) (2026-11-09)
- [x] 20. **Add subtitles** (soft or burned in) (2026-11-09)
- [x] 21. **Auto captions** (2026-11-09)
- [x] 22. **Metadata** and **fix video** (2026-11-09)
- [x] 23. **Screen recorder** (2026-11-09)
- [x] 24. **Batch** (2026-11-09)
- [x] 25. Release polish (2026-11-09)

**The 30 tools:** media info, convert, compress, extract audio, video to gif, frames, trim, split,
crop, resize, rotate, speed, reverse & loop, join, make for…, edit audio, clean up audio, remove
silence, filters, add text, watermark, blur region, slideshow, subtitle editor, add subtitles,
auto captions, metadata, fix video, screen recorder, batch. Plus the existing **merge videos**.

---

# Section 1: foundations and conversion

### Step 1: Shared tool framework

Make adding tools quick and consistent. Merge must keep working exactly as it does now.

- Registry entries get search keywords, the file kinds the tool accepts, and a lazy loader. The
  router builds its routes from the registry.
- Move merge into `src/tools/merge/`.
- Shared file helpers (file size text, output names, video/audio/image/subtitle detection).
- Shared components:
  - a tool page layout (header with back link, main area, optional sidebar, like merge);
  - a drop zone that loads and checks a file, with loading and error states;
  - a video/audio preview with merge's play controls;
  - an export dialog, generalized from merge's, with progress, time left, cancel, a preview of the
    result, and download (a ZIP when there are several files).
- Home gets a search box that filters tools.
- Each page sets its browser tab title.

### Step 2: Frame pipeline, big files, ZIP, and media info

- Read more about each file: format, size, duration, bitrate, codecs, resolution, frame rate,
  rotation, audio details, metadata, and whether this browser can play it.
- The **frame pipeline**: turn merge's export code into a shared one that decodes a video, lets a
  tool draw on each frame, and encodes the result, with audio copied, dropped or replaced. Merge
  uses it too.
- **Big files:** outputs over about 1 GB are saved straight to disk instead of being held in
  memory.
- **ZIP** downloads for tools that produce several files.
- While a job runs, keep the screen awake, warn before closing the tab, and show progress in the
  tab title.
- Tool **media info** (`media-info`, category `info & repair`):
  - Drop one or more files to see readable details for each.
  - Plain warnings: variable frame rate, not optimized for streaming, a codec this browser can't
    play, HDR, rotation.
  - Copy as text or download JSON.
  - A "what this browser can do" panel listing which formats it can play and make.

### Step 3: ffmpeg.wasm engine

- Add ffmpeg.wasm and host its files from the app itself (no CDN).
- Set the headers ffmpeg needs for its faster multi-threaded mode in the Vite dev and preview
  servers. Fall back to the single-thread version when they're missing.
- A shared wrapper that runs one ffmpeg job at a time, with progress, cancel and readable errors,
  without copying big input files into memory. Warn before inputs over about 1.5 GB.
- Check once which formats this ffmpeg build supports, and only offer those.
- Files the browser can't read (AVI, WMV…) are read through ffmpeg.
- A shared "load video engine (about 30 MB, downloaded once)" panel with a progress bar.
- A shared engine chooser: copy when possible, otherwise the browser's encoder, otherwise ffmpeg,
  with a plain reason shown to the user.

### Step 4: Convert

Tool **convert** (`convert`, category `convert`): convert anything to anything.

- Formats, grouped with one-line plain descriptions:
  - **Common:** MP4, MOV, WebM, MKV.
  - **Older or other:** AVI, WMV, FLV, MPG/MPEG-2, VOB, MPEG-TS, M2TS, 3GP, OGV.
  - **Editing:** ProRes, DNxHR.
  - **Archive:** FFV1 MKV.
  - Audio-only and GIF output point to their own tools.
  - Hide anything this browser and ffmpeg build can't make.
- Recognize a file's real format even when its extension is wrong.
- Drop one file or several (converted one after another with the same settings).
- Settings: format, video codec, audio codec, quality (smaller / balanced / high), resolution,
  frame rate, remove audio.
- Show whether it will be instant (copy), fast (hardware) or need the video engine, plus an
  estimated output size.
- Files the browser can't play show thumbnails instead of a player, with a short explanation.
- One-click presets: plays everywhere (MP4), web (WebM), iPhone, Android, old DVD player (MPG),
  video editing (ProRes), archive (FFV1).

### Step 5: Compress and extract audio

Tool **compress** (`compress`, category `convert`):

- Modes: **target size** (presets 10 / 25 / 50 / 100 MB), a **quality slider**, or **percent
  smaller**.
- Works out the bitrate from the target size. When the target is very small, it also lowers the
  resolution, frame rate or audio quality, and tells the user.
- If the file comes out too big, it retries with a lower bitrate (at most twice).
- Shows the size before and after, and a before/after comparison slider.

Tool **extract audio** (`extract-audio`, category `audio`):

- Takes a video or an audio file (so it also converts audio).
- Outputs: MP3, M4A, WAV, FLAC, OGG/Opus; AIFF, ALAC and WMA through ffmpeg; iPhone ringtone
  (`.m4r`, at most 40 s).
- Copies the audio as-is when possible ("instant, original quality").
- Options: bitrate, sample rate, mono or stereo, a trim range, which audio track.
- Title, artist, album and cover art (from a video frame or an image) where the format supports
  them.

### Step 6: Video to GIF and frames

Tool **video to gif** (`video-to-gif`, category `convert`):

- Settings: range, frame rate, width, speed, loop count, boomerang, number of colors, dithering.
- A live size estimate and a preview before download.
- Also animated WebP, when the ffmpeg build supports it.

Tool **frames** (`frames`, category `convert`):

- **Screenshot:** step frame by frame, then save the current frame at full resolution (PNG, JPEG
  or WebP) or copy it.
- **Extract many:** every N seconds, N evenly spaced, keyframes only, or every frame in a range,
  as a ZIP.
- **Contact sheet:** a grid of thumbnails with timestamps and file details, as one image.

---

# Section 2: editing

### Step 7: Shared timeline and trim

A shared **timeline** for every editing tool: zoom, scroll, time ruler, playhead, a thumbnail
strip, an audio waveform, one or more ranges with drag handles, markers, and keyboard controls
(frame step, I/O for in and out points).

Tool **trim** (`trim`, category `edit`):

- One range or several. **Keep selected** or **delete selected** (to cut out the middle).
- **Fast** mode: lossless, cuts snap to keyframes, and shows how far each cut moved.
- **Exact** mode: re-encodes for frame-exact cuts.
- Output one joined file, or each range as its own file (ZIP).

### Step 8: Split

Tool **split** (`split`, category `edit`). Split:

- every N seconds or minutes;
- into N equal parts;
- by maximum file size;
- at markers on the timeline;
- at **scene changes** (detected automatically; review them with thumbnails and turn each on or
  off).

Fast (lossless) or exact mode. Files are named `name_part01…` and download as a ZIP.

### Step 9: Crop, resize, rotate

These three share one transform helper that always produces even output sizes.

- Tool **crop** (`crop`): drag a crop box or type the numbers; aspect presets (free, 16:9, 9:16,
  1:1, 4:5, 4:3, 21:9); **auto-remove black bars**.
- Tool **resize** (`resize`): presets (4K, 1080p, 720p, 480p, 360p), by width or height, by
  percent, or custom. **Change aspect by padding** with black, a color or blurred video.
- Tool **rotate** (`rotate`): 90°, 180°, 270°, flip horizontal or vertical. **Lossless rotation**
  (just sets the rotation flag) or **bake it in** (re-encodes for players that ignore the flag).
  Straighten by a small angle, with auto-zoom to hide the corners.

### Step 10: Speed and reverse & loop

- Tool **speed** (`speed`, category `edit`):
  - 0.25× to 8×, for the whole video or one range.
  - Audio keeps its pitch, changes pitch, or is muted.
  - Slow motion repeats or blends frames.
  - **Timelapse:** keep every Nth frame, or set a target length.
- Tool **reverse & loop** (`reverse-loop`):
  - **Reverse** video and audio, working in chunks so long videos don't run out of memory.
  - **Boomerang** (forward then backward).
  - **Loop** N times or up to a length, without re-encoding when possible.

### Step 11: Join

Tool **join** (`join`, category `edit`):

- Drop many videos (and images, which become stills). Reorder by drag or keyboard.
- Per clip: trim and volume.
- Output size: from the first clip, the largest, or a preset. Fit with black bars, a blurred
  background, or fill.
- **Lossless join** when all clips have the same format; otherwise explain why not.
- **Transitions:** none, crossfade, fade through black, wipe, slide, with a chosen duration. The
  audio crossfades too.

### Step 12: Make for… (platform sizes)

Tool **make for…** (`make-for`, category `convert`):

- Platforms: YouTube, YouTube Shorts, TikTok, Instagram (Reels, Stories, Feed 1:1 and 4:5),
  Facebook, X, LinkedIn, Snapchat, WhatsApp, Discord, email. Keep their sizes and limits in one
  data file with a "last checked" date.
- Reframe: **fit with blurred background** (default), fit with bars, crop (with a position
  slider), or stretch. Live preview.
- If the video is too long, offer to trim it or split it into parts. If it's too big, compress it.

---

# Section 3: audio, look and overlays

### Step 13: Edit audio

Move merge's audio decoding and mixing into shared audio helpers first.

Tool **edit audio** (`edit-audio`, category `audio`):

- **Mute** (removes the audio without re-encoding the video).
- **Volume** 0–300%, fade in and fade out.
- **Replace audio** with another file: offset, loop or cut to fit, fades.
- **Add background music:** level, loop, fade out, and **automatically lower the music while
  someone talks**.
- **Fix audio sync:** shift the audio earlier or later, with a live preview.
- Pick or mix tracks when the file has several.

The video isn't re-encoded when only the audio changes.

### Step 14: Clean up audio and remove silence

Tool **clean up audio** (`clean-audio`, category `audio`):

- One click: "make it sound better" (noise reduction, then even out the volume).
- Toggles: noise reduction (RNNoise or similar, with a strength setting), hum removal (50/60 Hz),
  **loudness normalize** (streaming, podcast, broadcast or custom), and simple EQ presets (voice
  clarity, bass boost, remove rumble).
- A before/after toggle, and the loudness before and after.
- Works on audio files too.

Tool **remove silence** (`remove-silence`, category `audio`):

- Finds quiet parts (threshold, minimum length, padding) and shows them on the timeline. Each one
  can be turned on or off.
- Cuts them from video and audio with tiny crossfades, and shows the time saved.
- Option: speed up the quiet parts instead of cutting them.

### Step 15: Filters (colors, looks, fades)

A small WebGL effects pipeline that plugs into the frame pipeline, so the preview and the export
match. If the browser lacks WebGL2, say so.

Tool **filters** (`filters`, category `look & overlays`):

- **Adjust:** brightness, contrast, saturation, exposure, temperature, tint, hue, highlights and
  shadows, sharpen, vignette, blur.
- **Looks:** about 10 one-click presets with original names (for example "warm", "cool", "faded",
  "noir", "vivid", "retro", "black & white", "sepia").
- **Fades:** in and out, from black, white or a color.
- Apply to the whole video or a range. Before/after slider.

### Step 16: Add text and watermark

A shared **layer system** drawn by the frame pipeline. Each layer has a position, size, rotation,
opacity, start and end time, and an in/out animation (none, fade, slide, pop). Generalize merge's
stage so layers can be dragged and resized, with number inputs too.

- Tool **add text** (`add-text`, category `look & overlays`):
  - Multiple text layers.
  - About 10 bundled open fonts, plus uploading your own.
  - Size, color, outline, shadow, background box, alignment, wrapping.
  - Templates: title, lower third (name and role), caption, end card.
- Tool **watermark** (`watermark`, category `look & overlays`):
  - An image (PNG, JPEG, WebP, SVG) or text.
  - Corner presets with a margin, size, opacity, a **tiled** pattern, optional time range.
  - Saved as a reusable preset, which **batch** uses later.

### Step 17: Blur region

Tool **blur region** (`blur-region`, category `look & overlays`):

- Draw rectangles or ellipses: blur, pixelate, or a solid box, with soft edges.
- Set a time range.
- **Moving regions:** set positions at a few points in time and the region slides between them.
- **Follow automatically:** pick a box on one frame and it follows the object. Frames where it
  loses track are marked for a manual fix.
- Optional: bleep or mute the audio for the same time.

### Step 18: Slideshow

Tool **slideshow** (`slideshow`, category `create & batch`):

- Drop images (and short clips), sorted by name or photo date, with photo rotation applied.
  Reorder by drag.
- Seconds per slide (a default, editable per slide).
- Fit with a blurred background, bars, or fill. Gentle zoom and pan on or off.
- Transitions from the join tool, and a caption per slide.
- **Music** with fades, and "fit the slides to the music length".
- 16:9, 9:16 or 1:1.

---

# Section 4: subtitles, info, record, batch, release

### Step 19: Subtitle editor (edit, convert, resync)

Shared subtitle reading and writing for SRT, WebVTT, ASS/SSA, SBV, TTML and plain text, with
handling for files that aren't UTF-8.

Tool **subtitle editor** (`subtitle-editor`, category `subtitles`):

- The video plays with live subtitles. Edit each line's text and times, or drag them on the
  timeline over the waveform.
- Add a line at the playhead; split and merge lines.
- **Tap to time:** press a key at the start and end of each line while the video plays.
- Warnings for lines that are too fast to read or overlap. Undo and redo. Autosave.
- **Convert** to any supported format.
- **Resync:** shift everything, or fix two lines' times and stretch the rest. Frame-rate fix
  (23.976 ↔ 25).
- Clean up: remove `[music]`/`(laughs)` notes, wrap long lines.
- Works without a video too.

### Step 20: Add subtitles (soft or burned in)

Tool **add subtitles** (`add-subtitles`, category `subtitles`):

- **Soft subtitles** (viewers can turn them on and off; the video isn't re-encoded): MKV, MP4 and
  WebM, several languages, a default track.
- **Burned in** (always visible, drawn with the layer system): font, size, color, outline, box,
  position.
- **Social style** (uses word timings from auto captions): 1–3 words at a time with the current
  word highlighted.
- **Extract** subtitles already inside an MKV or MP4.

### Step 21: Auto captions

Tool **auto captions** (`auto-captions`, category `subtitles`; also found by searching
"transcribe" or "speech to text"):

- Speech to text in the browser with Whisper (via transformers.js), in a web worker.
- Model sizes tiny, base or small. Show the download size and ask first. Uses the GPU when
  available.
- Language: automatic or chosen. Optional **translate to English**.
- Word timings, grouped into readable lines.
- Progress for the download and the transcription, with time left and cancel. Long files work.
- A transcript where clicking a line jumps to it. Download SRT, VTT or TXT.
- Buttons to **edit** (subtitle editor), **burn in** or **add as soft subtitles** (add
  subtitles), without downloading first.

### Step 22: Metadata and fix video

Tool **metadata** (`metadata`, category `info & repair`):

- View and edit title, artist, comment, description, date and creation time.
- Show the **location (GPS)** and **camera or phone model**, each with a remove button.
- **Remove all metadata** for privacy, without re-encoding.
- Cover art: view, replace or remove.

Tool **fix video** (`fix-video`, category `info & repair`):

- An automatic check that lists problems in plain language, each with a one-click fix:
  - not optimized for streaming → make it stream fast;
  - variable frame rate → constant (fixes editors and audio drift);
  - wrong rotation;
  - broken timestamps or duration;
  - audio out of sync;
  - interlaced (combing lines) → deinterlace.
- **Recover a broken recording** (a phone or camera died mid-recording) using a healthy file from
  the same device as a reference. Support the common H.264 + AAC case; say plainly when it can't.

### Step 23: Screen recorder

Tool **screen recorder** (`record`, category `create & batch`):

- Record the **screen, a window or a tab** (with its sound where the browser allows), the
  **webcam**, the **microphone** (with a level meter), or **screen + webcam bubble** (draggable,
  resizable).
- 3-2-1 countdown, pause and resume, timer.
- Records straight to MP4, falling back to the browser's built-in recorder. Long recordings are
  saved as they go, so a crash doesn't lose them.
- Afterwards: preview, quick trim, download, or **open in another tool**.
- An audio-only mode (voice recorder).

### Step 24: Batch

Tool **batch** (`batch`, category `create & batch`):

- Pick a task and set it up once: convert, compress, resize, rotate, extract audio, watermark,
  clean up audio, remove all metadata, video to gif, or make for…. Each of those tools exposes its
  settings panel and its processing so batch can reuse them.
- Drop many files or a **folder** (including subfolders).
- A queue with each file's status, progress and new size. Run 1–2 at once. Pause, cancel, retry.
- Output as a ZIP, or saved straight into a folder you pick.
- A naming pattern (name, number, size).

### Step 25: Release polish

- **Home:**
  - Drop a file anywhere to see suggested tools ("you dropped a MOV: convert, compress, trim…").
    The file opens in the chosen tool.
  - Searching "mov to mp4", "video to mp3" or "srt to vtt" opens the right tool with the formats
    already set.
- **Send to another tool:** every result has an "open in…" menu, so the output can go to another
  tool without downloading it.
- **Friendly errors:** turn technical errors (unsupported codec, out of memory, storage full,
  failed downloads) into plain messages with a next step.
- **Settings:** a "downloads" area showing the size of the video engine and speech models, with
  delete buttons.
- **Deploy:** config files for Netlify, Vercel and Cloudflare Pages with the headers ffmpeg needs,
  plus a note on GitHub Pages.
- **Licensing:** a page listing every dependency's license. Some ffmpeg.wasm builds are GPL;
  explain the options and **ask the user to choose**. Show model licenses where models are
  downloaded.
- **README:** every tool by category, which browsers work best, and the development commands.

---

# Not in this plan

These were cut to keep the plan to about 30 tools. Any of them can be added later as new steps:

- **AI:** background removal, auto-crop to vertical that follows faces, face blur, upscaling,
  frame interpolation, highlight reels, splitting songs into vocals and instruments, text to
  speech, translating subtitles.
- **Editing:** a full multi-track editor, editing by deleting words from a transcript, green
  screen, stabilization, pro color grading, keyframe animation for every setting,
  picture-in-picture grids for more than 2 videos.
- **Analysis and extras:** bitrate and loudness graphs, comparing two videos, a frame inspector,
  OCR, QR scanning, chapters and track editing, audiograms, test-pattern generators, meme maker,
  templates.
- **Web and special formats:** streaming packages (HLS/DASH), opening videos from a link, 360°
  video, ASCII art, motion photos, calculators.
- **App-wide:** offline app, dark mode, translations, multi-step recipes, a desktop app,
  end-to-end tests and CI.

Always out of scope: DRM removal, downloaders for specific sites, uploading media to a server.

---

# Decisions log

_Add one entry per completed (or partly done) step: date, step number, what was built, shared code
later steps should reuse, and deviations from the plan. Later steps read this first._

- **2026-11-08, step 1 (framework).** `src/tools/registry.ts`: `CATEGORIES`, `Tool` (`keywords`
  is one comma-separated string, `accepts: FileKind[]`, `load: () => import("./<id>")`, the tool's
  default export is its page), `findTool`, `searchTools` (tested). `App.tsx` builds lazy routes from
  the registry. Home has search and numbers tools in category order. Merge moved to
  `src/tools/merge/` (its export now runs through the shared pipeline and shared dialog; behavior
  unchanged). Shared code to reuse:
  - `lib/files.ts`: `fileKind`, `acceptFor`, `describeKinds`, `outputName`, `uniqueNames`,
    `formatBytes`, `formatBitrate`, `downloadBlob`.
  - `components/ToolLayout.tsx`: `ToolLayout toolId sidebar` (sets the tab title), `ActionButton`,
    `PrivacyNote`.
  - `components/FileDrop.tsx`: `FileDrop accept load onLoad multiple compact` (big box, or a small
    "add" box with `compact`) and `FilePickerButton`. `load` throwing `HandledError`
    (`lib/errors.ts`) hides the message; `FriendlyError` messages are shown as is.
  - `components/MediaPreview.tsx` (play button, time, playhead; space toggles; `range` loops a
    part; `mediaRef`, `playbackRate`, `fallback`). `components/MediaFiles.tsx`: `FilePreview`
    (player, or engine-made thumbnails for unplayable files) and `MediaFileList`.
  - `components/ExportDialog.tsx`: `run({ signal, progress(fraction, label), target })` returns
    `{ files, warnings?, notes? }`; shows time left, cancel, preview (`BlobPreview`), one download
    or a ZIP; `renderResult` replaces the preview; `estimate` enables the save-to-disk offer.
  - `components/ui.tsx` gained `Advanced` (the "advanced" disclosure) and `Select` (with groups).
    Also `TimeInput` and `RangeFields` (from/to + "use all"), `CompareSlider` (before/after),
    `lib/objectUrl.ts` `useObjectUrl(blob)` (use this, not `createObjectURL` in effects: the lint
    rules forbid setState in effects), `lib/keys.ts` `isTyping`.
  - Deviation: the old `components/Dropzone.tsx` was removed (`FileDrop` replaces it).
    `tsconfig.node.json` + `@types/node` were added for `vite.config.ts`; `npm run typecheck` checks
    both.
- **2026-11-08, step 2 (pipeline, big files, ZIP, media info).** `lib/engine/inspect.ts`:
  `inspectMedia(file) → MediaInfo` (format by content, `realExtension` when the name is wrong,
  tracks, VFR via mediabunny frame-rate metrics, HDR, rotation, tags incl. make/model, `canPlay`,
  `fastStart` via `lib/engine/boxes.ts`), `mediaWarnings(info)`; throws `NeedsEngineError` for
  files the browser can't read. `lib/engine/pipeline.ts`: `renderVideo({ sources, size, fps,
  draw(ctx, { time, images, sizes }), audio: none | buffer | copy(source index), quality,
  container, target })` — decode, draw, encode; `copy` keeps a source's sound without re-encoding
  (a composable mediabunny `Conversion` driven in lockstep). Also `openVideo(file)`.
  `lib/audio/buffers.ts`: `decodeRange`, `sliceAudio` (merge's mixing itself stays in
  `tools/merge/export.ts` until step 13). `lib/output.ts`: `OutputTarget` (memory or a
  picked file), `mediabunnyTarget`, `writeBytes`, `BIG_OUTPUT` (1 GB). `lib/zip.ts`
  (client-zip, MIT, no compression): `zipBlob`, `saveZip` (streams to a picked file where
  supported). `lib/job.ts`: `useDocumentTitle`, `useJobGuards` (wake lock, beforeunload, % in the
  title; `ExportDialog` uses it). Tool **media info** done, with the capabilities panel
  (`lib/engine/capabilities.ts`: `browserCapabilities`, `canEncodeVideoAt`, `canEncodeAudioCodec`,
  `ensureEncoders` — registers `@mediabunny/mp3-encoder` and `@mediabunny/flac-encoder`, MPL-2.0,
  loaded lazily).
  - Not tested in a browser: the save-straight-to-disk path (needs a real file picker).
- **2026-11-08, step 3 (ffmpeg.wasm).** `@ffmpeg/ffmpeg` 0.12.15 (MIT) with `@ffmpeg/core` and
  `@ffmpeg/core-mt` 0.12.10 (**GPL-2.0-or-later**; step 25 must ask the user about this). A Vite
  plugin in `vite.config.ts` serves the core files byte for byte at `/ffmpeg/<version>/…` in dev
  and emits them there in builds (Vite's normal `?url` handling rewrote the worker script and
  broke the threaded build). Dev/preview send COOP/COEP; `crossOriginIsolated` picks the
  threaded build, otherwise single-thread (both verified in Chrome). `lib/ffmpeg/engine.ts`:
  `loadEngine` (downloads once into Cache Storage `everything-mp4-engine-v1` with progress;
  step 25's settings can list/delete it there), `useEngine` store, `isEngineCached`,
  `runFfmpeg({ inputs, args(paths), duration, signal, onProgress })` → files written to `/out/`
  (one job at a time; inputs are WORKERFS-mounted, not copied; cancel restarts the engine),
  `FfmpegError` (plain message from `logs.ts` `explainFailure`), `engineSupport()` /
  `knownSupport()` (muxers + encoders, remembered in localStorage), `ffmpegDescribe`,
  `ENGINE_BYTES`, `ENGINE_WARN_BYTES`. **Important:** the threaded build has a fixed pool of 32
  threads and freezes when ffmpeg starts more (two inputs + auto-threaded x264 did);
  `lib/ffmpeg/args.ts` `limitThreads` caps decoders (2 per input) and encoders/filters (4) and is
  applied to every job — keep the output file as the last argument. ffmpeg.wasm prints
  `Aborted()` even on success; don't treat it as an error. The build has libx264, libx265,
  libvpx(-vp9), prores_ks, dnxhd, ffv1, libtheora, mpeg2/4, wmv2, flv, h263, gif, libwebp(_anim),
  png, mjpeg, aac, libmp3lame, libopus, libvorbis, flac, alac, ac3, mp2, wmav2 — **no AV1
  encoder**. `lib/ffmpeg/probe.ts` + `inspect.ts`: `inspectWithEngine` reads AVI/WMV/… by parsing
  `ffmpeg -i`. `lib/ffmpeg/hooks.ts`: `useMediaLoader(onLoaded)` (browser first, else queues the
  file until the engine is loaded, then reads it), `useEngineWhenNeeded(needed)` (auto-loads when
  cached), `useEngineSupport`, `useAbilities` (what browser + engine can encode).
  `components/EnginePanel.tsx`: `EnginePanel reason` (size, load button, progress) and
  `EngineBadge choice`. `lib/engine/choose.ts` `chooseEngine` (copy → browser encoder → engine,
  with a plain reason; tested).
- **2026-11-08, step 4 (convert).** `lib/engine/formats.ts` holds every codec (`VIDEO_CODECS`,
  `AUDIO_CODECS`: label, mediabunny name, ffmpeg encoder), container (`ffmpegMuxer`,
  `mediabunnyFormat`) and the picker lists `VIDEO_FORMATS` / `AUDIO_FORMATS` — add formats there.
  `lib/engine/transcode.ts` `transcodeInBrowser` (mediabunny `Conversion`: copies untouched
  streams, picks the audio track, trims, writes tags). `lib/ffmpeg/convertArgs.ts` `convertArgs`
  (codec flags, scaling, DVD mode, trim, tags; tested). `lib/engine/estimate.ts`: `videoBitrate`,
  `audioBitrate`, `sizeFor`, `scaleToShortSide`. Tool code in `tools/convert/plan.ts` (presets,
  available formats, `planFile`). Resolution choices are the short side (720 = 720p), never
  upscaled. Deviation: the iPhone preset makes H.264 MOV (HEVC encoding isn't available
  everywhere); output names use the suffix `-converted`.
- **2026-11-08, step 5 (compress, extract audio).** Compress: `tools/compress/math.ts`
  (`planCompression`, `retryBitrate`; tested), output is always H.264/AAC MP4, up to 3 attempts
  for target modes, before/after `CompareSlider`. Compress takes one file. Extract audio: all
  formats from `AUDIO_FORMATS`; cover art only through the browser path (MP3, M4A, FLAC); the
  ffmpeg path writes text tags only. Ringtones are capped at 40 s.
- **2026-11-08, step 6 (video to gif, frames).** GIF/WebP are made by the engine
  (`tools/video-to-gif/gif.ts`: one-pass palettegen/paletteuse graph, speed, boomerang, loop
  counts, `estimateBytes` — a rough estimate that runs high on simple footage). Frames uses
  mediabunny only (`tools/frames/extract.ts`: `extractFrames`, `contactSheet`, `frameTimes`;
  at most 3000 frames per run) and needs a file the browser can decode; others are told to
  convert first. `lib/gfx/canvas.ts`: `canvasToBlob`, `grabFrame(video)`.
- **Verified 2026-11-08** in Chrome (Playwright, dev server and production build): every tool
  above ran end to end, including engine formats, cancel then rerun, the single-thread
  fallback, and a 360 px layout without horizontal scrolling. Not checked: Safari and Firefox.
  The local Homebrew `ffmpeg` CLI is broken (missing libx265 dylib), so test media was made
  with ffmpeg.wasm in the browser.
- **2026-11-08, steps 7–12 (section 2, editing).** Built fast, at the user's request: **no
  checks were run** (no typecheck, lint, tests, build or browser tries). The next turn should run
  `npm run typecheck`, `lint`, `test` and `build` first and fix what breaks. Every editing tool
  runs on the video engine (ffmpeg), not mediabunny. Shared code:
  - `components/EnginePage.tsx`: `EnginePage` (drop zone, settings panel, engine panel, one
    action button, export dialog; `jobs()` returns `EngineJob[]`: `args(inputs)`, `duration`,
    `name` for a single output, `mime`, `extraInputs`, `only`), `usePlayer` + `Player` (player
    whose element/time feed a timeline).
  - `components/Timeline.tsx`: ruler, playhead, draggable ranges (handles are sliders with arrow
    keys), markers, keys I/O/,/./M. **Cut:** no zoom/scroll, no thumbnail strip, no waveform.
  - `lib/ffmpeg/edit.ts`: `ENCODE_MP4` (x264 veryfast CRF 20 + AAC, has `-crf`, so don't add
    `-b:v` to it), `even`, `invertSpans`, `atempoChain`, `fitGraph` (blur/bars/crop/stretch;
    reuse for anything that fits video into a frame), `safeBase`, `sameExtension`, `mimeFor`,
    `detectScenes`, `detectCrop` (both read ffmpeg `metadata=print:file=/out/…`).
  - `components/CropPreview.tsx`: CSS-only live crop preview.
  - Deviations / cuts: trim fast mode doesn't report how far cuts moved; joining several fast
    parts re-encodes. Split's scene review has "show" buttons, not thumbnails. Crop has no
    draggable box (number fields + live preview). Rotate's lossless path sets the `rotate` tag
    with `-c copy` (unverified on this ffmpeg build). Reverse is not chunked (warns past 60 s).
    Join: videos only (no images as stills), reorder by up/down buttons (no drag), output 30 fps.
    Make for…: data in `tools/make-for/platforms.ts`; the preview is CSS, not the export code.
- **2026-11-08, steps 13–18 (section 3, audio, look and overlays).** Built fast again, **no
  checks run** (sections 2 and 3 are both unchecked: run typecheck/lint/test/build first). All
  tools run on the video engine through `EnginePage` (slideshow has its own page because it takes
  images). Also, at the user's request, removed every "convert it to MP4 first" / "this browser
  can't play X" nudge: `mediaWarnings` no longer warns about engine-read files or undecodable
  codecs, frames' load errors are plain, the frames Home hint and `MediaFiles` thumbnail text
  are gone. **Don't add such messages back.** Shared code:
  - `EnginePage` gained `renderResult` and per-job `notes(log)` (notes read from ffmpeg's log).
  - `lib/ffmpeg/edit.ts`: `between`, `lerpExpr` (piecewise-linear ffmpeg expression over time
    keys), `audioCodecFor(ext)`, `piecesGraph` (play spans one after another, each at its own
    speed, with tiny audio fades), `metadataValues` (reads `metadata`/`ametadata` print files —
    the way to get analysis out of ffmpeg, since `runFfmpeg` needs an output file).
  - `lib/overlays/layers.ts`: the layer system (`TextLayer`, `ImageLayer`, `drawLayer`,
    `layerPng`, `overlayGraph`, `layerInputs`, `FONTS`, `addFont`). Layers are drawn by canvas
    into frame-size PNGs that ffmpeg overlays, and `components/LayerCanvas.tsx` draws the same
    layers live, so preview = export. `components/OverlayPreview.tsx`: a video at its real shape
    with things drawn over it.
  - Watermark: `WatermarkPreset`, `loadPreset`, `watermarkLayer` exported from
    `tools/watermark/index.tsx` for batch (stored in localStorage `everything-mp4-watermark`).
  - Cuts / deviations: merge's audio mixing was **not** moved to shared helpers. No WebGL
    pipeline: filters are ffmpeg filters with a rough CSS preview (and a before/after slider on
    the result). Noise reduction is ffmpeg's `afftdn`, not RNNoise. Edit audio has no live sync
    preview and takes videos only. Remove silence joins with tiny fades, not crossfades. Text
    and watermark layers can't be dragged (sliders instead); "pop" animation and the 10 bundled
    fonts were cut (system font families + Pixelify + uploads). Blur region: no automatic
    tracking, regions are moved by pinning positions; the preview uses CSS backdrop blur.
    Slideshow: images only (no clips), sorting by file date not photo date, no drag reorder.
- **2026-11-09, steps 19–25 (section 4).** Built fast again, **no checks run**: sections 2, 3
  and 4 have never been typechecked, linted, tested, built or tried. Run all four checks first.
  New dependency: `@huggingface/transformers` 4.3.2 (Apache-2.0; pulls in onnxruntime-web, MIT).
  Shared code:
  - `lib/subtitles/format.ts`: `Cue`/`Word`, `loadSubtitles`, `readSubtitleFile` (UTF-8/16,
    else Windows-1252), `parseSubtitles`, `writeSubtitles`, `subtitleFile`, `wordsToCues`,
    `estimateWords`, `SUB_FORMATS`.
  - `lib/handoff.ts`: `handOff(files, cues?)` / `takeHandoff(kinds)`. `FileDrop` takes waiting
    files of its kinds on mount, so any tool can receive a file. `components/OpenIn.tsx` is the
    "open in…" menu (in every single-file `ExportDialog` result, the recorder and Home's drop).
  - `workers/whisper.ts`: Whisper in a worker, 30 s windows, tries
    `onnx-community/whisper-<size>_timestamped` for word timings and falls back to
    `onnx-community/whisper-<size>` (lines only). WebGPU when available, else WASM q8. Model ids
    and the stated sizes (40/80/250 MB) are **unverified**.
  - Burned-in subtitles: each shown state is drawn into a frame-size PNG and timed with an
    ffconcat list (one overlay input), so hundreds of lines don't mean hundreds of inputs.
  - `tools/batch/tasks.ts`: `batchJob(task, settings, info)`; batch reuses `make-for/platforms`,
    `video-to-gif/gif` and the watermark preset. Tools don't expose settings panels for batch;
    batch has its own small settings.
  - `components/Downloads.tsx` (in settings): sizes of Cache Storage `everything-mp4-engine-v1`
    and `transformers-cache`, with delete. `routes/Licenses.tsx` at `/licenses` (hand-written
    list). Deploy configs: `netlify.toml`, `vercel.json`, `public/_headers`.
  - Cuts / deviations: subtitle editor has no waveform. Social style works on any subtitles
    (word times estimated when unknown). Metadata reads tags with `ffmpeg -f ffmetadata`
    (needs the engine) and can't show cover art, only replace/remove it on audio files. Fix
    video's "recover a broken recording" just remuxes ignoring errors; it does **not** use a
    reference file (untrunc-style recovery was cut). Screen recorder uses MediaRecorder (MP4 where
    the browser supports it), the webcam bubble is placed by corner and size (no dragging), and
    crash safety writes chunks to OPFS (`recording.part`). Batch runs one file at a time (the
    engine is single-job). Home search doesn't pre-set formats ("mov to mp4" opens convert
    with defaults); Enter opens the first result.
  - **Open question for the user:** the GPL ffmpeg build. Options: keep it (hosting must follow
    the GPL), or switch to an LGPL build without x264/x265 (loses H.264/H.265 encoding in the
    engine; the browser encoder still makes H.264 where available). Not decided yet.
- **2026-11-09, SUBTITLES.md pass (user's UI feedback).** No checks run. Done:
  - Drop-zone subtitles rewritten per the user's list; **no subtitle ends with a period**. The
    "want just the sound?" style hints under drop zones are gone; don't add such cross-links.
  - `PrivacyNote` no longer says "your files never leave this device" (renders only its
    children, or nothing); privacy lines removed everywhere (Home tagline, merge, export dialog,
    engine panel, recorder, auto captions). Don't add them back.
  - `FileDrop` compact "replace video" has no plus sign (only "add …" for multi-file drops).
  - Unplayable files: `FilePreview` shows a card (first frame from the engine, number badge,
    name + summary, bin button via `onRemove`) instead of a row of frames. `EnginePage`'s
    `Player` takes `onRemove`; single-file tools pass `() => setMedia(null)`.
  - Renames: "make for…" → **post** (id still `make-for`), "merge videos" → **merge**. Merge's
    empty state uses the shared `FileDrop`. Merge (videos at the same time, side by side / PiP /
    grid) and join (one after another) are different tools, so both stay.
  - Add subtitles is listed before subtitle editor. **Fix video was removed** (folder, registry,
    README).
  - Media info redesigned: no sidebar; per file a card with first-frame thumbnail, format/codec
    chips, four stat tiles, accent-bordered warnings, and bordered detail sections (codec
    strings, "read by", "plays in this browser" and HDR "no" hidden on the page but kept in the
    text/JSON reports). Browser capabilities are a collapsed section at the bottom, listing only
    what works.
  - Licenses moved from the `/licenses` page and Home footer into the settings menu, under
    downloads (`components/Licenses.tsx`). Speech models stay cached (the user asked to keep
    caching after first asking not to).
  - Screen recorder: the audio context is now made on the click and resumed (it was made after
    the permission prompts and could record silence); a "mute mic" button mutes the microphone
    through its own gain node.
  - Batch: the start button just says "start"; the name-pattern help line was removed.
- **2026-11-09, file buttons.** The big "replace video" / "add videos" boxes are gone. `FileDrop`
  with `compact` is now a small round button (↻ to replace, + to add). Tools hand it to their
  preview through `FileActionsContext` (`components/FileActions.tsx`), and `MediaPreview`,
  `OverlayPreview`, the unplayable-file card and post's framing preview show it in their top-right
  corner next to a bin (`onRemove`). `EnginePage` does this for single-file tools; multi-file
  tools (join, convert's list, media info, slideshow) show the + inline. Merge's clip cards have
  a + next to replace and the bin. Metadata now shows the file above its details.
  `OpenIn` takes `also` (files that go along) and `cues`; auto captions and the subtitle editor
  send the video with the subtitles. Hand-offs older than 10 s are ignored.

