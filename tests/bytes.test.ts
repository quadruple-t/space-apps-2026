import { describe, expect, it } from "vitest";
import { base64ToU8, decodeFloat32, decodeInt16, decodeInt32, encodeFloat32 } from "@/lib/bytes";
import { decodeEphemerisData, ephemerisRow } from "@/lib/ephemeris";
import { readSeed } from "./helpers/seed";

describe("Bytes decode", () => {
  it("float32 round-trips through an unaligned view", () => {
    const values = [0, 1.5, -2.25, 1737.4, 3.4e38];
    const raw = encodeFloat32(values);
    const padded = new Uint8Array(raw.length + 1);
    padded.set(raw, 1);
    const unaligned = padded.subarray(1); // byteOffset 1: not 4-byte aligned
    const out = decodeFloat32({ toUint8Array: () => unaligned });
    expect(Array.from(out)).toEqual(Array.from(Float32Array.from(values)));
  });

  it("int16 / int32 decode little-endian", () => {
    expect(Array.from(decodeInt16(new Uint8Array([0x00, 0x80, 0xff, 0x7f])))).toEqual([-32768, 32767]);
    expect(Array.from(decodeInt32(new Uint8Array([1, 0, 0, 0, 0xff, 0xff, 0xff, 0xff])))).toEqual([1, -1]);
  });

  it("rejects truncated payloads", () => {
    expect(() => decodeFloat32(new Uint8Array(5))).toThrow();
  });

  it("decodes a seeded ephemeris chunk with plausible values", () => {
    const j = readSeed<{ count: number; data: { $bytes: string } }>("ephemerisGlobal/2026-01.json");
    const data = decodeEphemerisData(base64ToU8(j.data.$bytes), j.count);
    expect(j.count).toBe(31 * 24);
    const r = ephemerisRow(data, 0);
    expect(Math.abs(r.sunLatDeg)).toBeLessThan(1.6);
    expect(r.sunDistKm).toBeGreaterThan(1.4e8);
    expect(r.earthDistKm).toBeGreaterThan(356_000);
    expect(r.earthDistKm).toBeLessThan(407_000);
    expect(Math.abs(r.earthLatDeg)).toBeLessThan(7);
  });
});
