import { describe, expect, it } from "vitest";
import { isFastStart, parseBoxHeader, topLevelBoxes } from "./boxes";

function box(type: string, size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  return bytes;
}

describe("topLevelBoxes", () => {
  it("lists boxes in file order", async () => {
    const file = new Blob([box("ftyp", 24), box("moov", 100), box("mdat", 500)]);
    const boxes = await topLevelBoxes(file);
    expect(boxes.map((b) => b.type)).toEqual(["ftyp", "moov", "mdat"]);
    expect(boxes[2]).toEqual({ type: "mdat", offset: 124, size: 500 });
  });

  it("stops at garbage", async () => {
    const file = new Blob([box("ftyp", 16), new Uint8Array(32).fill(0xff)]);
    expect((await topLevelBoxes(file)).map((b) => b.type)).toEqual(["ftyp"]);
  });
});

describe("parseBoxHeader", () => {
  it("reads 64-bit sizes and to-the-end boxes", () => {
    const big = new DataView(new ArrayBuffer(16));
    big.setUint32(0, 1);
    big.setUint32(4, 0x6d646174); // "mdat"
    big.setBigUint64(8, 5_000_000_000n);
    expect(parseBoxHeader(big, 0, 6e9)?.size).toBe(5_000_000_000);

    const rest = new DataView(box("mdat", 8).buffer);
    rest.setUint32(0, 0);
    expect(parseBoxHeader(rest, 100, 1000)?.size).toBe(900);
  });
});

describe("isFastStart", () => {
  const b = (type: string) => ({ type, offset: 0, size: 8 });
  it("checks whether the index comes first", () => {
    expect(isFastStart([b("ftyp"), b("moov"), b("mdat")])).toBe(true);
    expect(isFastStart([b("ftyp"), b("mdat"), b("moov")])).toBe(false);
    expect(isFastStart([b("ftyp"), b("moov"), b("moof"), b("mdat")])).toBe(true);
    expect(isFastStart([b("ftyp")])).toBeNull();
  });
});
