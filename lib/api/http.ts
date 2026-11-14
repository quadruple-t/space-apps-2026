import { NextResponse } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", ...init?.headers }, ...init });
}

export function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (typeof value === "object" && value !== null && "toUint8Array" in value && typeof value.toUint8Array === "function") {
    return Buffer.from(value.toUint8Array()).toString("base64");
  }
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const v = value as Record<string, unknown> & { toDate?: () => Date; latitude?: number; longitude?: number; path?: string };
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (typeof v.latitude === "number" && typeof v.longitude === "number") return { latitude: v.latitude, longitude: v.longitude };
    if (typeof v.path === "string" && Object.keys(v).length <= 2) return v.path;
    return Object.fromEntries(Object.entries(v).map(([key, child]) => [key, serialize(child)]));
  }
  return value;
}
