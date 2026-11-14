/**
 * JPL Horizons helpers — parse OBSERVER and VECTORS ephemerides.
 * Server-side: called from /api/horizons. Client-side: parser used in tests.
 */

export interface ObserverEntry {
  /** ISO-8601 UTC */
  time: string
  /** Apparent azimuth (clockwise from north) in degrees */
  az: number
  /** Apparent elevation above local horizontal in degrees */
  el: number
}

export interface VectorEntry {
  time: string
  /** X, Y, Z position in AU, ecliptic frame */
  x: number; y: number; z: number
}

// ─── OBSERVER parser (QUANTITIES=4) ──────────────────────────────────────────
// Between $$SOE / $$EOE each line looks like:
//   1969-Jul-20 20:17 *i   88.805431  10.697711
export function parseHorizonsObserver(raw: string): ObserverEntry[] {
  const soe = raw.indexOf("$$SOE")
  const eoe = raw.indexOf("$$EOE")
  if (soe === -1 || eoe === -1) return []

  const entries: ObserverEntry[] = []
  for (const line of raw.slice(soe + 5, eoe).trim().split("\n")) {
    const m = line.trim().match(
      /^(\d{4}-\w{3}-\d{2}\s+\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s+(?:\*\S+\s+)?([\d.-]+)\s+([\d.-]+)/
    )
    if (m) entries.push({ time: horizonsDateToISO(m[1]), az: parseFloat(m[2]), el: parseFloat(m[3]) })
  }
  return entries
}

// ─── VECTORS parser (VEC_TABLE=1) ─────────────────────────────────────────────
export function parseHorizonsVectors(raw: string): VectorEntry[] {
  const soe = raw.indexOf("$$SOE")
  const eoe = raw.indexOf("$$EOE")
  if (soe === -1 || eoe === -1) return []

  const entries: VectorEntry[] = []
  const lines = raw.slice(soe + 5, eoe).trim().split("\n").map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/^(\d{4}-\w{3}-\d{2}\s+\d{2}:\d{2})/)
    if (!dm) continue
    const block = [lines[i], lines[i + 1] ?? ""].join(" ")
    const xm = block.match(/X\s*=\s*([\d.E+\-]+)/)
    const ym = block.match(/Y\s*=\s*([\d.E+\-]+)/)
    const zm = block.match(/Z\s*=\s*([\d.E+\-]+)/)
    if (xm && ym && zm) { entries.push({ time: horizonsDateToISO(dm[1]), x: +xm[1], y: +ym[1], z: +zm[1] }); i++ }
  }
  return entries
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
  Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12",
}
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export function horizonsDateToISO(raw: string): string {
  const m = raw.trim().match(/^(\d{4})-(\w{3})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/)
  if (!m) return raw
  const [,yr,mon,day,hr,min,sec="00",frac="000"] = m
  return `${yr}-${MONTHS[mon]??'01'}-${day}T${hr}:${min}:${sec}.${frac.padEnd(3,"0").slice(0,3)}Z`
}

/** "2026-11-14T12:00:00.000Z" → "2026-Nov-14 12:00" */
export function isoToHorizons(iso: string): string {
  const d = new Date(iso)
  const yr = d.getUTCFullYear()
  const mon = MON[d.getUTCMonth()]
  const day = String(d.getUTCDate()).padStart(2, "0")
  const hr  = String(d.getUTCHours()).padStart(2, "0")
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  return `${yr}-${mon}-${day} ${hr}:${min}`
}

// ─── URL builders ─────────────────────────────────────────────────────────────
const BASE = "https://ssd.jpl.nasa.gov/api/horizons.api"

export function buildObserverUrl(opts: {
  command: string        // "10" = Sun, "399" = Earth
  lat: number            // degrees N
  lon: number            // degrees E (0–360 or ±180 both accepted)
  alt_km?: number
  start: string          // Horizons format: "2026-Nov-14 12:00"
  stop: string
  step?: string          // "1m", "1h", etc.
}): string {
  return `${BASE}?${new URLSearchParams({
    format: "text", MAKE_EPHEM:"YES",
    COMMAND:    `'${opts.command}'`,
    EPHEM_TYPE: "OBSERVER",
    CENTER:     "'coord@301'",
    COORD_TYPE: "GEODETIC",
    SITE_COORD: `'${opts.lon},${opts.lat},${opts.alt_km ?? 0}'`,
    START_TIME: `'${opts.start}'`,
    STOP_TIME:  `'${opts.stop}'`,
    STEP_SIZE:  `'${opts.step ?? "1m"}'`,
    QUANTITIES: "'4'",
    ANG_FORMAT: "DEG",
    SKIP_DAYLT: "NO",
  })}`
}
