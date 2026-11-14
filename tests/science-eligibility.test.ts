import { describe, expect, it } from "vitest"
import { indexEntryIsScientific, scienceEligibility } from "@/lib/science/site-eligibility"
import { readSeed } from "./helpers/seed"

type IndexRow = { id: string; latDeg: number | null; lonDeg: number | null; pointIsApproximate: boolean; coordsVerified: boolean }
type SiteDoc = { coordinates: { latDeg: number; lonDeg: number } | null; coordsVerified: boolean }
const index = readSeed<{ sites: IndexRow[] }>("catalog/siteIndex.json").sites
const row = (id: string) => index.find((s) => s.id === id)!
const doc = (id: string) => readSeed<SiteDoc>(`sites/${id}.json`)

describe("catalog coordinate provenance for science lookups", () => {
  it("accepts a verified point site", () => {
    const r = scienceEligibility(doc("apollo-11-tranquility"))
    expect(r).toMatchObject({ ok: true, latDeg: 0.67416, lonDeg: 23.47314 })
    expect(indexEntryIsScientific(row("apollo-11-tranquility"))).toBe(true)
  })

  it("rejects an unverified point site (Luna 9)", () => {
    const luna9 = doc("luna-9")
    expect(luna9.coordinates).not.toBeNull()
    expect(luna9.coordsVerified).toBe(false)
    const r = scienceEligibility(luna9)
    expect(r.ok).toBe(false)
    expect(indexEntryIsScientific(row("luna-9"))).toBe(false)
  })

  it("rejects an Artemis region reference", () => {
    const region = index.find((s) => s.pointIsApproximate)!
    expect(scienceEligibility(doc(region.id)).ok).toBe(false)
    expect(indexEntryIsScientific(region)).toBe(false)
  })

  it("does not apply to custom lat/lon, which carry no catalog claim", () => {
    expect(scienceEligibility(undefined).ok).toBe(false) // no site document: only reachable with siteId
  })

  it("keeps the seeded index and site documents in agreement", () => {
    for (const e of index) {
      const d = doc(e.id)
      expect(e.coordsVerified, e.id).toBe(d.coordsVerified && d.coordinates !== null && !e.pointIsApproximate)
      expect(indexEntryIsScientific(e), e.id).toBe(scienceEligibility(d).ok)
    }
  })
})
