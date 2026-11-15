import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DELTA_V } from "@/lib/engine/deltav"
import { LAUNCH_CLASSES } from "@/lib/engine/launch-costs"

const sources = readFileSync(join(process.cwd(), "docs/SOURCES.md"), "utf8")
const documented = (id: string) => new RegExp(`^\\| ${id} \\|`, "m").test(sources)

describe("docs/SOURCES.md covers every model constant", () => {
  it("delta-v source ids", () => {
    const ids = new Set(Object.values(DELTA_V).flatMap((phases) => Object.values(phases).map((v) => v.sourceId)))
    for (const id of ids) expect(documented(id), id).toBe(true)
  })
  it("launch class source ids", () => {
    for (const c of LAUNCH_CLASSES) expect(documented(c.sourceId), c.sourceId).toBe(true)
  })
  it("every id tagged 'SOURCES: ID' in lib/engine is documented", () => {
    for (const f of ["deltav.ts", "launch-costs.ts", "trajectory.ts", "mission-estimate.ts", "rocket.ts"]) {
      const text = readFileSync(join(process.cwd(), "lib/engine", f), "utf8")
      for (const m of text.matchAll(/SOURCES: ([A-Z0-9-]+)/g)) expect(documented(m[1]), `${f} ${m[1]}`).toBe(true)
    }
  })
  it("Artemis reference id and fixture", () => {
    expect(documented("HZ-1")).toBe(true)
    const ref = JSON.parse(readFileSync(join(process.cwd(), "data/trajectory/artemis-1-reference.json"), "utf8"))
    expect(ref.orionKm.length).toBe(ref.moonKm.length)
    expect(ref.targets).toEqual({ orion: "-1023", moon: "301" })
  })
})
