/**
 * Sizes and limits for each platform. These change often: check them again and update
 * `LAST_CHECKED` now and then.
 */
export const LAST_CHECKED = "2026-11-08";

export interface Platform {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Longest video, in seconds, or null for no practical limit. */
  maxSeconds: number | null;
  /** Biggest file, in bytes, or null for no practical limit. */
  maxBytes: number | null;
}

const MB = 1024 ** 2;

export const PLATFORMS: Platform[] = [
  { id: "youtube", label: "YouTube", width: 1920, height: 1080, maxSeconds: null, maxBytes: null },
  { id: "shorts", label: "YouTube Shorts", width: 1080, height: 1920, maxSeconds: 180, maxBytes: null },
  { id: "tiktok", label: "TikTok", width: 1080, height: 1920, maxSeconds: 600, maxBytes: null },
  { id: "reels", label: "Instagram Reels", width: 1080, height: 1920, maxSeconds: 180, maxBytes: null },
  { id: "stories", label: "Instagram Stories", width: 1080, height: 1920, maxSeconds: 60, maxBytes: null },
  { id: "ig-square", label: "Instagram feed (1:1)", width: 1080, height: 1080, maxSeconds: 3600, maxBytes: null },
  { id: "ig-portrait", label: "Instagram feed (4:5)", width: 1080, height: 1350, maxSeconds: 3600, maxBytes: null },
  { id: "facebook", label: "Facebook", width: 1920, height: 1080, maxSeconds: 14400, maxBytes: null },
  { id: "x", label: "X", width: 1920, height: 1080, maxSeconds: 140, maxBytes: 512 * MB },
  { id: "linkedin", label: "LinkedIn", width: 1920, height: 1080, maxSeconds: 600, maxBytes: null },
  { id: "snapchat", label: "Snapchat", width: 1080, height: 1920, maxSeconds: 60, maxBytes: null },
  { id: "whatsapp", label: "WhatsApp", width: 1280, height: 720, maxSeconds: null, maxBytes: 16 * MB },
  { id: "discord", label: "Discord (free)", width: 1280, height: 720, maxSeconds: null, maxBytes: 10 * MB },
  { id: "email", label: "email", width: 1280, height: 720, maxSeconds: null, maxBytes: 25 * MB },
];
