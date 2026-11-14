/**
 * Decoding helpers for Firestore Bytes fields.
 *
 * The client SDK returns a `Bytes` object; call `.toUint8Array()` and pass the result here.
 * The view returned by the SDK may not be aligned for Float32/Int16 access, so every helper
 * copies into a fresh, aligned ArrayBuffer. All stored binary data is little-endian, which is
 * the native byte order of every browser platform we target; `assertLittleEndian()` guards it.
 */

export type BytesLike = Uint8Array | { toUint8Array(): Uint8Array };

export function toU8(b: BytesLike): Uint8Array {
  return b instanceof Uint8Array ? b : b.toUint8Array();
}

function alignedCopy(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

let littleEndianChecked = false;
export function assertLittleEndian(): void {
  if (littleEndianChecked) return;
  const probe = new Uint8Array(new Uint16Array([1]).buffer);
  if (probe[0] !== 1) throw new Error("Shadowline binary data requires a little-endian platform");
  littleEndianChecked = true;
}

export function decodeFloat32(b: BytesLike): Float32Array {
  assertLittleEndian();
  const u8 = toU8(b);
  if (u8.byteLength % 4 !== 0) throw new Error(`float32 payload length ${u8.byteLength} is not a multiple of 4`);
  return new Float32Array(alignedCopy(u8));
}

export function decodeInt16(b: BytesLike): Int16Array {
  assertLittleEndian();
  const u8 = toU8(b);
  if (u8.byteLength % 2 !== 0) throw new Error(`int16 payload length ${u8.byteLength} is not a multiple of 2`);
  return new Int16Array(alignedCopy(u8));
}

export function decodeInt32(b: BytesLike): Int32Array {
  assertLittleEndian();
  const u8 = toU8(b);
  if (u8.byteLength % 4 !== 0) throw new Error(`int32 payload length ${u8.byteLength} is not a multiple of 4`);
  return new Int32Array(alignedCopy(u8));
}

export function decodeUint8(b: BytesLike): Uint8Array {
  return new Uint8Array(alignedCopy(toU8(b)));
}

/** Encode helpers (used by tests and by the seed script's round-trip check). */
export function encodeFloat32(a: ArrayLike<number>): Uint8Array {
  return new Uint8Array(Float32Array.from(a).buffer);
}

/** base64 -> Uint8Array without Node Buffer (works in browser and Node). */
export function base64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
