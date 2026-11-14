// Prefetch one year of hourly JPL Horizons data for every preset site, plus
// geocentric Moon and Sun vectors, into public/data/horizons/prefetch/.
// The API route serves slices of these files, so the demo works offline.
//
//   node scripts/prefetch-horizons.ts          # skip files that already exist
//   node scripts/prefetch-horizons.ts --force  # refetch everything
//
// Runs under Node's built-in TypeScript type stripping (Node 22.6+).
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PRESET_SITES } from "../data/sites.ts"
import { buildObserverUrl, buildVectorsUrl, isoToHorizons, parseHorizonsObserver, parseHorizonsVectors } from "../lib/horizons.ts"
import {
  DEMO_START_ISO, PREFETCH_DAYS, PREFETCH_STEP_HOURS, observerFile, vectorsFile,
  type PrefetchedObserver, type PrefetchedVectors,
} from "../lib/prefetch.ts"

const OUT = join(process.cwd(), "public", "data", "horizons", "prefetch")
const force = process.argv.includes("--force")
const start = isoToHorizons(DEMO_START_ISO)
const stop = isoToHorizons(new Date(Date.parse(DEMO_START_ISO) + PREFETCH_DAYS * 86_400_000).toISOString())
const step = `${PREFETCH_STEP_HOURS}h`
const expected = PREFETCH_DAYS * 24 / PREFETCH_STEP_HOURS + 1

const r3 = (n: number) => Math.round(n * 1000) / 1000

async function horizons(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url)
      const text = await res.text()
      if (res.ok && text.includes("$$SOE")) return text
      throw new Error(text.split("\n").find((l) => /error/i.test(l)) ?? `HTTP ${res.status}`)
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
  throw new Error("unreachable")
}

mkdirSync(OUT, { recursive: true })
const jobs: { file: string; run: () => Promise<object> }[] = []

for (const command of ["301", "10"]) {
  jobs.push({
    file: vectorsFile(command),
    run: async () => {
      const rows = parseHorizonsVectors(await horizons(buildVectorsUrl({ command, start, stop, step })))
      if (rows.length !== expected) throw new Error(`expected ${expected} rows, got ${rows.length}`)
      const data: PrefetchedVectors = {
        kind: "vectors", command, startIso: DEMO_START_ISO, stepHours: PREFETCH_STEP_HOURS,
        x: rows.map((r) => Math.round(r.x)), y: rows.map((r) => Math.round(r.y)), z: rows.map((r) => Math.round(r.z)),
      }
      return data
    },
  })
}

for (const site of PRESET_SITES) {
  for (const command of ["10", "399"]) {
    jobs.push({
      file: observerFile(command, site.latitudeDeg, site.longitudeDeg),
      run: async () => {
        const url = buildObserverUrl({ command, lat: site.latitudeDeg, lon: site.longitudeDeg, alt_km: 0, start, stop, step })
        const rows = parseHorizonsObserver(await horizons(url))
        if (rows.length !== expected) throw new Error(`expected ${expected} rows, got ${rows.length}`)
        const data: PrefetchedObserver = {
          kind: "observer", command, lat: site.latitudeDeg, lon: site.longitudeDeg,
          startIso: DEMO_START_ISO, stepHours: PREFETCH_STEP_HOURS, az: rows.map((r) => r3(r.az)), el: rows.map((r) => r3(r.el)),
        }
        return data
      },
    })
  }
}

let done = 0, failed = 0
for (const job of jobs) {
  const path = join(OUT, job.file)
  if (!force && existsSync(path)) { done++; continue }
  const t = Date.now()
  try {
    writeFileSync(path, JSON.stringify(await job.run()))
    done++
    console.log(`[${done + failed}/${jobs.length}] ${job.file} (${((Date.now() - t) / 1000).toFixed(0)} s)`)
  } catch (e) {
    failed++
    console.error(`[${done + failed}/${jobs.length}] FAILED ${job.file}: ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`Done: ${done} ok, ${failed} failed. Window ${start} → ${stop}, step ${step}.`)
process.exit(failed ? 1 : 0)
