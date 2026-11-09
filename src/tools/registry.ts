import {
  ArrowRightLeft,
  AudioLines,
  Captions,
  Crop,
  EyeOff,
  Gauge,
  ImagePlay,
  Images,
  Info,
  Layers2,
  Monitor,
  NotebookPen,
  Subtitles,
  Tags,
  Palette,
  Presentation,
  Layers,
  ListVideo,
  Repeat,
  RotateCw,
  Scaling,
  Scissors,
  Shrink,
  Smartphone,
  Sparkles,
  Split,
  Stamp,
  Type,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import type { FileKind } from "../lib/files";

export const CATEGORIES = [
  "convert",
  "edit",
  "audio",
  "look & overlays",
  "subtitles",
  "info & repair",
  "create & batch",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Tool {
  /** Also the route: the tool lives at `/<id>`. */
  id: string;
  label: string;
  /** One plain sentence, shown on hover and used by search. */
  description: string;
  category: Category;
  icon: LucideIcon;
  /** Extra words people might search for, comma-separated ("mov to mp4, shrink"). */
  keywords: string;
  /** The kinds of files the tool takes. */
  accepts: FileKind[];
  /** Loads the tool's page, so each tool's code is only downloaded when it's opened. */
  load: () => Promise<{ default: ComponentType }>;
}

/** Every tool, in the order Home lists them within their category. */
export const tools: Tool[] = [
  {
    id: "convert",
    label: "convert",
    description: "Change a video's format: MP4, MOV, WebM, MKV, AVI, MPG, ProRes and more.",
    category: "convert",
    icon: ArrowRightLeft,
    keywords:
      "format, mov to mp4, mkv to mp4, avi, wmv, webm, prores, transcode, h264, hevc, change format",
    accepts: ["video"],
    load: () => import("./convert"),
  },
  {
    id: "compress",
    label: "compress",
    description: "Make a video file smaller: pick a target size, a quality, or how much smaller.",
    category: "convert",
    icon: Shrink,
    keywords: "smaller, reduce size, shrink, file size, discord, email, mb",
    accepts: ["video"],
    load: () => import("./compress"),
  },
  {
    id: "video-to-gif",
    label: "video to gif",
    description: "Turn part of a video into an animated GIF or WebP.",
    category: "convert",
    icon: ImagePlay,
    keywords: "gif, animated, webp, meme, loop, boomerang",
    accepts: ["video"],
    load: () => import("./video-to-gif"),
  },
  {
    id: "frames",
    label: "frames",
    description:
      "Save a still from a video, pull out many frames as images, or make a contact sheet.",
    category: "convert",
    icon: Images,
    keywords:
      "screenshot, still, thumbnail, image, png, jpg, snapshot, contact sheet, extract frames",
    accepts: ["video"],
    load: () => import("./frames"),
  },
  {
    id: "make-for",
    label: "post",
    description:
      "Get a video ready for YouTube, TikTok, Instagram, X, WhatsApp, Discord and more: right shape, length and size.",
    category: "convert",
    icon: Smartphone,
    keywords:
      "post, make for, youtube, shorts, tiktok, instagram, reels, stories, facebook, twitter, x, linkedin, snapchat, whatsapp, discord, email, vertical, 9:16, social media",
    accepts: ["video"],
    load: () => import("./make-for"),
  },
  {
    id: "merge",
    label: "merge",
    description:
      "Play parts of several videos at once: overlay them, put them side by side or in a grid, and mix their audio.",
    category: "edit",
    icon: Layers,
    keywords:
      "picture in picture, pip, side by side, grid, collage, combine, split screen, reaction",
    accepts: ["video"],
    load: () => import("./merge"),
  },
  {
    id: "trim",
    label: "trim",
    description: "Cut the start, the end, or parts in the middle of a video.",
    category: "edit",
    icon: Scissors,
    keywords: "cut, shorten, clip, remove part, cut out, keep part",
    accepts: ["video"],
    load: () => import("./trim"),
  },
  {
    id: "split",
    label: "split",
    description: "Cut a video into parts: every few minutes, by size, at markers or at scene changes.",
    category: "edit",
    icon: Split,
    keywords: "split, parts, segments, chunks, scenes, divide, pieces",
    accepts: ["video"],
    load: () => import("./split"),
  },
  {
    id: "crop",
    label: "crop",
    description: "Cut away the edges of the picture, change its shape, or remove black bars.",
    category: "edit",
    icon: Crop,
    keywords: "crop, black bars, letterbox, square, vertical, 9:16, 1:1, aspect ratio",
    accepts: ["video"],
    load: () => import("./crop"),
  },
  {
    id: "resize",
    label: "resize",
    description: "Make the picture bigger or smaller (1080p, 720p…), or change its shape with bars.",
    category: "edit",
    icon: Scaling,
    keywords: "resize, scale, resolution, 1080p, 720p, 4k, downscale, upscale, pad",
    accepts: ["video"],
    load: () => import("./resize"),
  },
  {
    id: "rotate",
    label: "rotate",
    description: "Turn a sideways video upright, mirror it, or straighten a tilt.",
    category: "edit",
    icon: RotateCw,
    keywords: "rotate, turn, sideways, upside down, flip, mirror, straighten, 90",
    accepts: ["video"],
    load: () => import("./rotate"),
  },
  {
    id: "speed",
    label: "speed",
    description: "Speed up or slow down a video, or make a timelapse.",
    category: "edit",
    icon: Gauge,
    keywords: "speed up, slow motion, slowmo, fast forward, timelapse, 2x, 0.5x",
    accepts: ["video"],
    load: () => import("./speed"),
  },
  {
    id: "reverse-loop",
    label: "reverse & loop",
    description: "Play a video backwards, make a boomerang, or repeat it.",
    category: "edit",
    icon: Repeat,
    keywords: "reverse, backwards, rewind, boomerang, loop, repeat",
    accepts: ["video"],
    load: () => import("./reverse-loop"),
  },
  {
    id: "join",
    label: "join",
    description: "Put videos one after another into a single video, with transitions if you like.",
    category: "edit",
    icon: ListVideo,
    keywords: "join, combine, concatenate, append, stitch, merge clips, transition, crossfade",
    accepts: ["video"],
    load: () => import("./join"),
  },
  {
    id: "extract-audio",
    label: "extract audio",
    description: "Save a video's sound as MP3, M4A, WAV, FLAC and more, or convert an audio file.",
    category: "audio",
    icon: AudioLines,
    keywords:
      "mp3, video to mp3, audio, sound, music, m4a, wav, flac, ringtone, m4r, convert audio",
    accepts: ["video", "audio"],
    load: () => import("./extract-audio"),
  },
  {
    id: "edit-audio",
    label: "edit audio",
    description:
      "Mute a video, change its volume, replace its sound, add background music, or fix audio sync.",
    category: "audio",
    icon: Volume2,
    keywords:
      "mute, remove audio, volume, louder, quieter, fade, replace audio, background music, add music, audio sync, delay, ducking",
    accepts: ["video"],
    load: () => import("./edit-audio"),
  },
  {
    id: "clean-audio",
    label: "clean up audio",
    description: "Reduce background noise and hum, make voices clearer, and even out the volume.",
    category: "audio",
    icon: Sparkles,
    keywords:
      "noise reduction, denoise, hum, hiss, normalize, loudness, lufs, podcast, voice, eq, bass, enhance",
    accepts: ["video", "audio"],
    load: () => import("./clean-audio"),
  },
  {
    id: "remove-silence",
    label: "remove silence",
    description: "Find the quiet parts of a video or recording and cut them out or speed them up.",
    category: "audio",
    icon: VolumeX,
    keywords: "silence, quiet, pauses, dead air, jump cut, auto cut, podcast",
    accepts: ["video", "audio"],
    load: () => import("./remove-silence"),
  },
  {
    id: "media-info",
    label: "media info",
    description:
      "See everything about a file: format, size, codecs, resolution, frame rate and more.",
    category: "info & repair",
    icon: Info,
    keywords:
      "details, properties, codec, bitrate, resolution, fps, metadata, probe, mediainfo, ffprobe",
    accepts: ["video", "audio"],
    load: () => import("./media-info"),
  },
  {
    id: "metadata",
    label: "metadata",
    description: "See and edit a file's title, dates, location and camera details, or remove them all.",
    category: "info & repair",
    icon: Tags,
    keywords: "metadata, tags, exif, gps, location, privacy, remove metadata, title, camera, creation date, cover art",
    accepts: ["video", "audio"],
    load: () => import("./metadata"),
  },
  {
    id: "filters",
    label: "filters",
    description: "Change brightness, contrast and colors, pick a look like warm or noir, or add fades.",
    category: "look & overlays",
    icon: Palette,
    keywords:
      "filter, color, brightness, contrast, saturation, black and white, sepia, vintage, fade in, fade out, vignette, sharpen, blur",
    accepts: ["video"],
    load: () => import("./filters"),
  },
  {
    id: "add-text",
    label: "add text",
    description: "Put titles, captions, lower thirds and end cards on a video.",
    category: "look & overlays",
    icon: Type,
    keywords: "text, title, caption, lower third, name, end card, words, font, overlay",
    accepts: ["video"],
    load: () => import("./add-text"),
  },
  {
    id: "watermark",
    label: "watermark",
    description: "Put your logo or name on a video, in a corner or repeated across it.",
    category: "look & overlays",
    icon: Stamp,
    keywords: "watermark, logo, copyright, brand, stamp, overlay image",
    accepts: ["video"],
    load: () => import("./watermark"),
  },
  {
    id: "blur-region",
    label: "blur region",
    description: "Hide faces, number plates or private details with blur, pixels or a black box.",
    category: "look & overlays",
    icon: EyeOff,
    keywords: "blur, pixelate, censor, hide, face, license plate, redact, mosaic, bleep",
    accepts: ["video"],
    load: () => import("./blur-region"),
  },
  {
    id: "add-subtitles",
    label: "add subtitles",
    description:
      "Add subtitles viewers can turn on, burn them into the picture, or pull them out of a video.",
    category: "subtitles",
    icon: Subtitles,
    keywords:
      "subtitles, captions, burn in, hardcode, soft subtitles, mkv, srt, extract subtitles, tiktok captions, social",
    accepts: ["video", "subtitle"],
    load: () => import("./add-subtitles"),
  },
  {
    id: "subtitle-editor",
    label: "subtitle editor",
    description:
      "Edit, retime and convert subtitles (SRT, VTT, ASS, SBV, TTML), with or without the video.",
    category: "subtitles",
    icon: NotebookPen,
    keywords:
      "subtitles, captions, srt, vtt, webvtt, ass, ssa, sbv, ttml, srt to vtt, vtt to srt, resync, shift, timing, edit subtitles",
    accepts: ["subtitle"],
    load: () => import("./subtitle-editor"),
  },
  {
    id: "auto-captions",
    label: "auto captions",
    description: "Turn speech into subtitles or a transcript with Whisper, right in your browser.",
    category: "subtitles",
    icon: Captions,
    keywords:
      "transcribe, transcription, speech to text, whisper, auto subtitles, captions, translate, voice to text",
    accepts: ["video", "audio"],
    load: () => import("./auto-captions"),
  },
  {
    id: "slideshow",
    label: "slideshow",
    description: "Turn photos into a video with transitions, captions and music.",
    category: "create & batch",
    icon: Presentation,
    keywords: "slideshow, photos, pictures, images to video, montage, ken burns, music",
    accepts: ["image"],
    load: () => import("./slideshow"),
  },
  {
    id: "record",
    label: "screen recorder",
    description: "Record your screen, a window, a tab, your webcam or your voice.",
    category: "create & batch",
    icon: Monitor,
    keywords: "record, screen recording, screencast, webcam, camera, voice recorder, microphone, capture",
    accepts: [],
    load: () => import("./record"),
  },
  {
    id: "batch",
    label: "batch",
    description: "Do the same thing to many files at once: convert, compress, resize, watermark and more.",
    category: "create & batch",
    icon: Layers2,
    keywords: "batch, bulk, many files, folder, queue, multiple, mass convert",
    accepts: ["video", "audio"],
    load: () => import("./batch"),
  },
];

export function findTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}

/**
 * Tools matching a search, best first. Every word of the query has to appear in the tool's label,
 * description or keywords; matches in the label rank highest.
 */
export function searchTools(query: string, list: readonly Tool[] = tools): Tool[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  const scored = list.flatMap((tool) => {
    const label = tool.label.toLowerCase();
    const keywords = tool.keywords.toLowerCase();
    const text = `${label} | ${keywords} | ${tool.description.toLowerCase()} | ${tool.category}`;
    if (!words.every((w) => text.includes(w))) return [];
    const phrase = words.join(" ");
    let score = 0;
    if (label.includes(phrase)) score += 4;
    if (keywords.includes(phrase)) score += 2;
    score += words.filter((w) => label.includes(w)).length;
    return [{ tool, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}
