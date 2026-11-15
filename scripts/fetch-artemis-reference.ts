/**
 * One-off fetch of the Artemis I (Orion EM-1, Horizons id -1023) post-TLI trajectory and the Moon
 * (id 301), both Earth-centred (500@399), ICRF ecliptic vectors, 1 h steps from just after TLI to
 * the outbound lunar flyby. Writes data/trajectory/artemis-1-reference.json (static: the app makes
 * no live Horizons calls). Run: npx tsx scripts/fetch-artemis-reference.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"

const START = "2022-11-16 09:00", STOP = "2022-11-21 18:00"

async function vectors(id: string) {
  const q = new URLSearchParams({
    format: "json", COMMAND: `'${id}'`, EPHEM_TYPE: "VECTORS", CENTER: "'500@399'", REF_PLANE: "ECLIPTIC",
    REF_SYSTEM: "ICRF", OUT_UNITS: "KM-S", VEC_TABLE: "1", CSV_FORMAT: "YES",
    START_TIME: `'${START}'`, STOP_TIME: `'${STOP}'`, STEP_SIZE: "'1 h'",
  })
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`)
  const { result } = (await res.json()) as { result: string }
  const body = result.split("$$SOE")[1]?.split("$$EOE")[0]
  if (!body) throw new Error(`no ephemeris for ${id}: ${result.slice(-300)}`)
  return body.trim().split("\n").map((l) => {
    const c = l.split(",").map((s) => s.trim())
    return { t: Date.parse(`${c[1].replace("A.D. ", "")} UTC`), p: [Number(c[2]), Number(c[3]), Number(c[4])] }
  })
}

async function main() {
  const [orion, moon] = await Promise.all([vectors("-1023"), vectors("301")])
  const r0 = (n: number) => Math.round(n)
  const out = {
    source: "JPL Horizons API, EPHEM_TYPE=VECTORS, CENTER=500@399, REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF, 1 h step",
    retrieved: new Date().toISOString().slice(0, 10),
    note: "Artemis I (Orion EM-1) post-TLI NASA/JSC as-flown trajectory and the Moon, Earth-centred ecliptic km. TLI itself is not in Horizons.",
    targets: { orion: "-1023", moon: "301" },
    startUtc: new Date(orion[0].t).toISOString(),
    stepHours: 1,
    orionKm: orion.map((s) => s.p.map(r0)),
    moonKm: moon.slice(0, orion.length).map((s) => s.p.map(r0)),
  }
  mkdirSync("data/trajectory", { recursive: true })
  writeFileSync("data/trajectory/artemis-1-reference.json", JSON.stringify(out) + "\n")
  console.log(out.startUtc, orion.length, "samples")
}

main().catch((e) => { console.error(e); process.exit(1) })
