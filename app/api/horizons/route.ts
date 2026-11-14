import { NextRequest, NextResponse } from "next/server"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { parseHorizonsObserver, buildObserverUrl, parseHorizonsVectors } from "@/lib/horizons"

const CACHE_DIR = join(process.cwd(), "public", "data", "horizons")

function cacheKey(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("_")
    .replace(/[^a-zA-Z0-9._=+-]/g, "-")
    .slice(0, 120)
}

function readCache(key: string): string | null {
  const p = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, "utf8")).raw ?? null } catch { return null }
}

function writeCache(key: string, raw: string, meta: Record<string, unknown>) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ queried_at: new Date().toISOString(), raw, ...meta }, null, 2))
}

export async function GET(req: NextRequest) {
  const sp  = req.nextUrl.searchParams
  const type    = sp.get("type")    ?? "OBSERVER"
  const command = sp.get("command") ?? "10"
  const start   = sp.get("start")
  const stop    = sp.get("stop")
  const step    = sp.get("step")    ?? "1m"
  const lat     = parseFloat(sp.get("lat")    ?? "0")
  const lon     = parseFloat(sp.get("lon")    ?? "0")
  const alt_km  = parseFloat(sp.get("alt_km") ?? "0")

  if (!start || !stop) return NextResponse.json({ error: "Missing start or stop" }, { status: 400 })

  const key = cacheKey({ type, command, start, stop, step, lat: String(lat), lon: String(lon) })
  const cached = readCache(key)

  if (cached) {
    const entries = type === "OBSERVER" ? parseHorizonsObserver(cached) : parseHorizonsVectors(cached)
    return NextResponse.json({ source: "cache", entries })
  }

  const url = buildObserverUrl({ command, lat, lon, alt_km, start, stop, step })
  let raw: string
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
    raw = await res.text()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  writeCache(key, raw, { command, type, lat, lon, alt_km, start, stop, step })
  const entries = type === "OBSERVER" ? parseHorizonsObserver(raw) : parseHorizonsVectors(raw)
  return NextResponse.json({ source: "live", entries })
}
