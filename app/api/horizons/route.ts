import { NextRequest, NextResponse } from "next/server"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import {
  buildObserverUrl, buildVectorsUrl, horizonsDateToISO, parseHorizonsObserver, parseHorizonsVectors,
  type ObserverEntry, type VectorEntry,
} from "@/lib/horizons"
import {
  observerFile, sliceIndices, vectorsFile, type PrefetchedObserver, type PrefetchedVectors,
} from "@/lib/prefetch"

const CACHE_DIR = join(process.cwd(), "public", "data", "horizons")
const PREFETCH_DIR = join(CACHE_DIR, "prefetch")

const COMMANDS = new Set(["10", "301", "399"])
const HORIZONS_DATE = /^\d{4}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}$/
const STEP = /^([1-9]\d{0,3})([mh])$/

function cacheKey(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("_")
    .replace(/[^a-zA-Z0-9._=+-]/g, "-")
    .slice(0, 120)
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, "utf8")) as T } catch { return null }
}

/** Best effort: read-only deployments (e.g. Vercel) just skip the runtime cache. */
function writeCache(key: string, raw: string, meta: Record<string, unknown>) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ queried_at: new Date().toISOString(), raw, ...meta }))
  } catch { /* ignore */ }
}

const iso = (ms: number) => new Date(ms).toISOString()

/** Serve a slice of the prefetched year for preset sites (works when Horizons is down). */
function fromPrefetch(type: string, command: string, lat: number, lon: number, startMs: number, stopMs: number, stepHours: number | null): ObserverEntry[] | VectorEntry[] | null {
  if (stepHours === null) return null
  if (type === "OBSERVER") {
    const f = readJson<PrefetchedObserver>(join(PREFETCH_DIR, observerFile(command, lat, lon)))
    const idx = f && sliceIndices(f.startIso, f.stepHours, f.el.length, startMs, stopMs, stepHours)
    if (!f || !idx) return null
    const t0 = Date.parse(f.startIso), step = f.stepHours * 3_600_000
    return idx.map((i) => ({ time: iso(t0 + i * step), az: f.az[i], el: f.el[i] }))
  }
  const f = readJson<PrefetchedVectors>(join(PREFETCH_DIR, vectorsFile(command)))
  const idx = f && sliceIndices(f.startIso, f.stepHours, f.x.length, startMs, stopMs, stepHours)
  if (!f || !idx) return null
  const t0 = Date.parse(f.startIso), step = f.stepHours * 3_600_000
  return idx.map((i) => ({ time: iso(t0 + i * step), x: f.x[i], y: f.y[i], z: f.z[i] }))
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get("type") === "VECTORS" ? "VECTORS" : "OBSERVER"
  const command = sp.get("command") ?? "10"
  const start = sp.get("start") ?? ""
  const stop = sp.get("stop") ?? ""
  const step = sp.get("step") ?? "1m"
  const lat = Number(sp.get("lat") ?? "0")
  const lon = Number(sp.get("lon") ?? "0")
  const alt_km = Number(sp.get("alt_km") ?? "0")
  const quantities = sp.get("quantities") === "4,20" ? "4,20" : "4"

  const stepMatch = step.match(STEP)
  if (!COMMANDS.has(command)) return NextResponse.json({ error: "command must be 10, 301 or 399" }, { status: 400 })
  if (!HORIZONS_DATE.test(start) || !HORIZONS_DATE.test(stop)) return NextResponse.json({ error: "start/stop must look like 2026-Dec-01 00:00" }, { status: 400 })
  if (!stepMatch) return NextResponse.json({ error: "step must look like 1h or 10m" }, { status: 400 })
  if (type === "OBSERVER" && (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 360) || !(alt_km > -20 && alt_km < 20))) {
    return NextResponse.json({ error: "lat, lon or alt_km out of range" }, { status: 400 })
  }

  const startMs = Date.parse(horizonsDateToISO(start)), stopMs = Date.parse(horizonsDateToISO(stop))
  const stepHours = stepMatch[2] === "h" ? Number(stepMatch[1]) : null
  if (quantities === "4") {
    const pre = fromPrefetch(type, command, lat, lon, startMs, stopMs, stepHours)
    if (pre) return NextResponse.json({ source: "prefetch", entries: pre })
  }

  const keyParams: Record<string, string> = { type, command, start, stop, step }
  if (type === "OBSERVER") { keyParams.lat = String(lat); keyParams.lon = String(lon) }
  if (quantities !== "4") keyParams.q = quantities
  const key = cacheKey(keyParams)
  const cached = readJson<{ raw?: string }>(join(CACHE_DIR, `${key}.json`))?.raw
  const parse = (raw: string) => (type === "OBSERVER" ? parseHorizonsObserver(raw) : parseHorizonsVectors(raw))
  if (cached) return NextResponse.json({ source: "cache", entries: parse(cached) })

  const url = type === "OBSERVER"
    ? buildObserverUrl({ command, lat, lon, alt_km, start, stop, step, quantities })
    : buildVectorsUrl({ command, start, stop, step })
  let raw: string
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
    raw = await res.text()
  } catch (err) {
    return NextResponse.json({ error: `Horizons unavailable: ${String(err)}` }, { status: 502 })
  }

  // Horizons reports bad requests as HTTP 200 with no ephemeris block.
  if (!raw.includes("$$SOE")) {
    const reason = raw.split("\n").find((l) => /error|cannot|invalid|exceed/i.test(l))?.trim()
    return NextResponse.json({ error: reason ?? "Horizons returned no ephemeris" }, { status: 502 })
  }

  writeCache(key, raw, { command, type, lat, lon, alt_km, start, stop, step })
  return NextResponse.json({ source: "live", entries: parse(raw) })
}
