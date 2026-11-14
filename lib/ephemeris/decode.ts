import { decodeFloat32, type BytesLike } from "@/lib/bytes";
import { EPHEMERIS_LAYOUT } from "@/lib/model/types";

export const EPHEMERIS_STRIDE = EPHEMERIS_LAYOUT.length; // 6

/** Firestore Bytes (float32 count×6, little-endian) → Float32Array rows. */
export function decodeEphemerisData(bytes: BytesLike, count: number): Float32Array {
  const data = decodeFloat32(bytes);
  if (data.length !== count * EPHEMERIS_STRIDE) {
    throw new Error(`ephemeris payload has ${data.length} values, expected ${count}×${EPHEMERIS_STRIDE}`);
  }
  return data;
}

/** Row accessor (degrees / km), mostly for tests and debugging. */
export function ephemerisRow(data: Float32Array, i: number) {
  const o = i * EPHEMERIS_STRIDE;
  return {
    sunLatDeg: data[o], sunLonDeg: data[o + 1], sunDistKm: data[o + 2],
    earthLatDeg: data[o + 3], earthLonDeg: data[o + 4], earthDistKm: data[o + 5],
  };
}
