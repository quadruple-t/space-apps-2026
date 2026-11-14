/**
 * Firestore storage-size estimate, per https://firebase.google.com/docs/firestore/storage-size:
 *   string = UTF-8 bytes + 1; bytes = length; number = 8; boolean = 1; null = 1;
 *   timestamp = 8; array = sum of values; map = sum of (field name + 1 + value);
 *   document = document name size + sum of fields + 32;
 *   document name = sum of (segment UTF-8 + 1) + 16.
 */
import { Timestamp } from "firebase-admin/firestore";
import type { SeedData, SeedValue } from "./load";

function strSize(s: string): number {
  return Buffer.byteLength(s, "utf8") + 1;
}

export function valueSize(v: SeedValue): number {
  if (v === null || typeof v === "boolean") return 1;
  if (typeof v === "number") return 8;
  if (typeof v === "string") return strSize(v);
  if (Buffer.isBuffer(v)) return v.length;
  if (v instanceof Timestamp) return 8;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + valueSize(x), 0);
  return mapSize(v);
}

function mapSize(m: { [k: string]: SeedValue }): number {
  let n = 0;
  for (const [k, v] of Object.entries(m)) n += strSize(k) + valueSize(v);
  return n;
}

export function documentNameSize(path: string): number {
  return path.split("/").reduce((n, seg) => n + strSize(seg), 0) + 16;
}

export function documentSize(path: string, data: SeedData): number {
  return documentNameSize(path) + mapSize(data) + 32;
}
