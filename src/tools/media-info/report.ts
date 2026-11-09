import { mediaWarnings, type MediaInfo } from "../../lib/engine/inspect";
import { formatBitrate, formatBytes } from "../../lib/files";
import { formatTime } from "../../lib/time";

export type Row = [label: string, value: string];

export function channelsText(channels: number): string {
  if (channels === 1) return "mono";
  if (channels === 2) return "stereo";
  if (channels === 6) return "5.1 surround";
  if (channels === 8) return "7.1 surround";
  return `${channels} channels`;
}

/** The details of a file as labeled rows, grouped into sections. */
export function sections(info: MediaInfo): { title: string; rows: Row[] }[] {
  const out: { title: string; rows: Row[] }[] = [];
  const general: Row[] = [
    ["format", info.format.name],
    ["file size", `${formatBytes(info.size)} (${info.size.toLocaleString()} bytes)`],
    ["length", formatTime(info.duration, 2)],
  ];
  if (info.bitrate) general.push(["overall bitrate", formatBitrate(info.bitrate)]);
  general.push(["plays in this browser", info.canPlay ? "yes" : "no"]);
  if (info.fastStart !== null) {
    general.push(["optimized for streaming", info.fastStart ? "yes" : "no"]);
  }
  general.push(["read by", info.readBy === "browser" ? "this browser" : "the video engine"]);
  out.push({ title: "general", rows: general });

  info.video.forEach((v, i) => {
    const rows: Row[] = [
      ["codec", v.codec],
      ["size", `${v.width}×${v.height}`],
    ];
    if (v.fps) rows.push(["frame rate", `${v.fps} fps${v.variableFrameRate ? " (variable)" : ""}`]);
    if (v.bitrate) rows.push(["bitrate", formatBitrate(v.bitrate)]);
    if (v.rotation) rows.push(["rotation flag", `${v.rotation}°`]);
    rows.push(["HDR", v.hdr ? "yes" : "no"]);
    if (v.language) rows.push(["language", v.language]);
    if (v.codecString) rows.push(["codec string", v.codecString]);
    out.push({ title: info.video.length > 1 ? `video ${i + 1}` : "video", rows });
  });

  info.audio.forEach((a, i) => {
    const rows: Row[] = [["codec", a.codec]];
    if (a.sampleRate) rows.push(["sample rate", `${(a.sampleRate / 1000).toLocaleString()} kHz`]);
    rows.push(["channels", channelsText(a.channels)]);
    if (a.bitrate) rows.push(["bitrate", formatBitrate(a.bitrate)]);
    if (a.language) rows.push(["language", a.language]);
    if (a.codecString) rows.push(["codec string", a.codecString]);
    out.push({ title: info.audio.length > 1 ? `audio ${i + 1}` : "audio", rows });
  });

  if (info.subtitles.length) {
    out.push({
      title: "subtitles",
      rows: info.subtitles.map((s, i) => [
        `track ${i + 1}`,
        `${s.codec}${s.language ? ` (${s.language})` : ""}`,
      ]),
    });
  }

  const tags: Row[] = Object.entries(info.tags).map(([k, v]) => [k, v]);
  if (info.hasCoverArt) tags.push(["cover art", "yes"]);
  if (tags.length) out.push({ title: "metadata", rows: tags });
  return out;
}

/** A plain-text report, for copying. */
export function textReport(infos: readonly MediaInfo[]): string {
  return infos
    .map((info) => {
      const lines = [info.name, "=".repeat(Math.min(60, info.name.length))];
      for (const warning of mediaWarnings(info)) lines.push(`! ${warning}`);
      for (const section of sections(info)) {
        lines.push("", section.title.toUpperCase());
        const width = Math.max(...section.rows.map(([label]) => label.length));
        for (const [label, value] of section.rows) lines.push(`${label.padEnd(width)}  ${value}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/** A JSON report, for downloading. */
export function jsonReport(infos: readonly MediaInfo[]): string {
  return JSON.stringify(
    infos.map((info) => ({ ...info, warnings: mediaWarnings(info) })),
    null,
    2,
  );
}
