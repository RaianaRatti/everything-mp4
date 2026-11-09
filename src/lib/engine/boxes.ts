export interface Box {
  type: string;
  offset: number;
  size: number;
}

/**
 * Reads the top-level boxes of an MP4/MOV file ("ftyp", "moov", "mdat"…). Only the 16-byte headers
 * are read, so it's instant even for huge files. Stops at the first box that doesn't make sense.
 */
export async function topLevelBoxes(file: Blob, max = 64): Promise<Box[]> {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset + 8 <= file.size && boxes.length < max) {
    const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    const box = parseBoxHeader(header, offset, file.size);
    if (!box) break;
    boxes.push(box);
    offset += box.size;
  }
  return boxes;
}

/** One box header at `offset`, or null when it isn't a valid box. */
export function parseBoxHeader(view: DataView, offset: number, fileSize: number): Box | null {
  if (view.byteLength < 8) return null;
  let size = view.getUint32(0);
  const type = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7),
  );
  if (!/^[\x20-\x7e]{4}$/.test(type)) return null;
  if (size === 1) {
    // 64-bit size follows the type.
    if (view.byteLength < 16) return null;
    size = Number(view.getBigUint64(8));
  } else if (size === 0) {
    // Runs to the end of the file.
    size = fileSize - offset;
  }
  if (size < 8) return null;
  return { type, offset, size };
}

/**
 * Whether an MP4/MOV starts playing before it has fully downloaded: its index ("moov") comes
 * before the media ("mdat"), or it's fragmented. Null when the boxes don't tell.
 */
export function isFastStart(boxes: readonly Box[]): boolean | null {
  const types = boxes.map((b) => b.type);
  if (types.includes("moof")) return true;
  const moov = types.indexOf("moov");
  const mdat = types.indexOf("mdat");
  if (moov < 0 || mdat < 0) return null;
  return moov < mdat;
}
