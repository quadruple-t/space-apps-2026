/**
 * Small typed readers over raw Firestore document data. Each throws DocumentShapeError
 * (with the document path) when a field has the wrong type, so a bad seed shows up as a
 * clear message instead of NaN in a chart. Works with client and Admin SDK values.
 */
import type { BytesLike } from "@/lib/bytes";
import { DocumentShapeError } from "./errors";

export type Data = Record<string, unknown>;

interface TimestampLike {
  toDate(): Date;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function";
}

function isBytesLike(v: unknown): v is BytesLike {
  return (
    v instanceof Uint8Array ||
    (typeof v === "object" && v !== null && typeof (v as { toUint8Array?: unknown }).toUint8Array === "function")
  );
}

/** Timestamp | Date | ISO string -> ISO string; anything else -> null. */
export function toIso(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (isTimestampLike(v)) return v.toDate().toISOString();
  return null;
}

export class Reader {
  constructor(
    readonly path: string,
    readonly data: Data,
  ) {}

  private fail(key: string, expected: string): never {
    const v = this.data[key];
    const got = v === undefined ? "missing" : v === null ? "null" : typeof v;
    throw new DocumentShapeError(this.path, `field "${key}" should be ${expected}, got ${got}`);
  }

  has(key: string): boolean {
    return this.data[key] !== undefined && this.data[key] !== null;
  }

  str(key: string): string {
    const v = this.data[key];
    return typeof v === "string" ? v : this.fail(key, "a string");
  }

  strOrNull(key: string): string | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return typeof v === "string" ? v : this.fail(key, "a string or null");
  }

  num(key: string): number {
    const v = this.data[key];
    return typeof v === "number" && Number.isFinite(v) ? v : this.fail(key, "a finite number");
  }

  numOrNull(key: string): number | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return typeof v === "number" && Number.isFinite(v) ? v : this.fail(key, "a number or null");
  }

  bool(key: string): boolean {
    const v = this.data[key];
    return typeof v === "boolean" ? v : this.fail(key, "a boolean");
  }

  boolOrNull(key: string): boolean | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return typeof v === "boolean" ? v : this.fail(key, "a boolean or null");
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const v = this.data[key];
    return typeof v === "string" && (allowed as readonly string[]).includes(v)
      ? (v as T)
      : this.fail(key, `one of ${allowed.join("|")}`);
  }

  oneOfOrNull<T extends string>(key: string, allowed: readonly T[]): T | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return this.oneOf(key, allowed);
  }

  bytes(key: string): BytesLike {
    const v = this.data[key];
    return isBytesLike(v) ? v : this.fail(key, "Bytes");
  }

  bytesOrNull(key: string): BytesLike | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return isBytesLike(v) ? v : this.fail(key, "Bytes or null");
  }

  /** Timestamp or ISO string -> ISO string. */
  iso(key: string): string {
    return toIso(this.data[key]) ?? this.fail(key, "a Timestamp or ISO string");
  }

  isoOrNull(key: string): string | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return toIso(v) ?? this.fail(key, "a Timestamp, ISO string or null");
  }

  isoOpt(key: string): string | undefined {
    return this.isoOrNull(key) ?? undefined;
  }

  /** Array of unchecked items (content is trusted seed JSON). */
  arr<T>(key: string): T[] {
    const v = this.data[key];
    return Array.isArray(v) ? (v as T[]) : this.fail(key, "an array");
  }

  arrOpt<T>(key: string): T[] | undefined {
    const v = this.data[key];
    if (v === undefined || v === null) return undefined;
    return this.arr<T>(key);
  }

  strArr(key: string): string[] {
    const a = this.arr<unknown>(key);
    return a.every((x) => typeof x === "string") ? (a as string[]) : this.fail(key, "an array of strings");
  }

  /** Nested map (content unchecked beyond being an object). */
  obj<T>(key: string): T {
    const v = this.data[key];
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as T) : this.fail(key, "a map");
  }

  objOrNull<T>(key: string): T | null {
    const v = this.data[key];
    if (v === undefined || v === null) return null;
    return this.obj<T>(key);
  }

  sub(key: string): Reader {
    return new Reader(`${this.path}.${key}`, this.obj<Data>(key));
  }
}
