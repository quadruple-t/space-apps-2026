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
  /** Observer→target distance in AU (present when QUANTITIES includes 20) */
  rangeAu?: number
}

export interface VectorEntry {
  time: string
  /** Geocentric position in km, ecliptic J2000 frame */
  x: number; y: number; z: number
}

// ─── OBSERVER parser (QUANTITIES=4 or 4,20) ──────────────────────────────────
// Between $$SOE / $$EOE each line looks like:
//   1969-Jul-20 20:17 *i   88.805431  10.697711
//   2026-Nov-14 00:00 *   126.619609   1.496957  0.98787543056046   0.2966886
// The flag column (blank, "*", "i", "*i", rise/set letters) is optional.
const OBSERVER_LINE =
  /^(\d{4}-\w{3}-\d{2}\s+\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s+(?:[*A-Za-z]{1,3}\s+)?(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+(?:E[+-]?\d+)?)\s+-?[\d.]+)?/

export function parseHorizonsObserver(raw: string): ObserverEntry[] {
  const soe = raw.indexOf("$$SOE")
  const eoe = raw.indexOf("$$EOE")
  if (soe === -1 || eoe === -1) return []

  const entries: ObserverEntry[] = []
  for (const line of raw.slice(soe + 5, eoe).trim().split("\n")) {
    const m = line.trim().match(OBSERVER_LINE)
    if (!m) continue
    const entry: ObserverEntry = { time: horizonsDateToISO(m[1]), az: parseFloat(m[2]), el: parseFloat(m[3]) }
    if (m[4] !== undefined) entry.rangeAu = parseFloat(m[4])
    entries.push(entry)
  }
  return entries
}

// ─── VECTORS parser (VEC_TABLE=1, CSV_FORMAT=YES) ────────────────────────────
// 2461375.500000000, A.D. 2026-Dec-01 00:00:00.0000, -3.4167E+05,  1.5794E+05, -6.7622E+03,
export function parseHorizonsVectors(raw: string): VectorEntry[] {
  const soe = raw.indexOf("$$SOE")
  const eoe = raw.indexOf("$$EOE")
  if (soe === -1 || eoe === -1) return []

  const entries: VectorEntry[] = []
  for (const line of raw.slice(soe + 5, eoe).trim().split("\n")) {
    const cols = line.split(",").map((c) => c.trim())
    const date = cols[1]?.match(/(\d{4}-\w{3}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/)
    if (!date || cols.length < 5) continue
    const [x, y, z] = cols.slice(2, 5).map(Number)
    if ([x, y, z].every(Number.isFinite)) entries.push({ time: horizonsDateToISO(date[1]), x, y, z })
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
  quantities?: "4" | "4,20"
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
    QUANTITIES: `'${opts.quantities ?? "4"}'`,
    ANG_FORMAT: "DEG",
    SKIP_DAYLT: "NO",
  })}`
}

/** Geocentric ecliptic position of a body (km). "301" Moon, "10" Sun. */
export function buildVectorsUrl(opts: { command: string; start: string; stop: string; step?: string }): string {
  return `${BASE}?${new URLSearchParams({
    format: "text", MAKE_EPHEM: "YES",
    COMMAND:    `'${opts.command}'`,
    EPHEM_TYPE: "VECTORS",
    CENTER:     "'500@399'",
    START_TIME: `'${opts.start}'`,
    STOP_TIME:  `'${opts.stop}'`,
    STEP_SIZE:  `'${opts.step ?? "1h"}'`,
    VEC_TABLE:  "1",
    REF_PLANE:  "ECLIPTIC",
    OUT_UNITS:  "KM-S",
    CSV_FORMAT: "YES",
    VEC_LABELS: "NO",
  })}`
}
