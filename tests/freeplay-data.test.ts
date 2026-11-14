/**
 * Freeplay's data path (lib/lunar-data.ts, lib/orbit.ts) against the seeded Lunaris360
 * ephemeris in data/seed/ephemerisGlobal (the same chunks the API serves).
 */
import { describe, expect, it } from "vitest"
import { CartesianSeries, siteFrame, azElFromCartesian } from "@/lib/ephemeris"
import { earthUp, summarizeByLunarDay, sunUp } from "@/lib/illumination"
import { horizonAt, siteSamples, type TerrainHorizon } from "@/lib/lunar-data"
import { orbitGeometry, phase } from "@/lib/orbit"
import { loadChunk, readSeed } from "./helpers/seed"

const months = (from: string, n: number) => {
  const [y, m] = from.split("-").map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  })
}
const YEAR = new CartesianSeries(months("2026-12", 13).map(loadChunk))
const START = Date.parse("2026-12-01T00:00:00Z")
const SMOOTH: TerrainHorizon = { elevationsDeg: null, azimuthStepDeg: 1, source: "none — smooth horizon" }

type CatalogIndex = { sites: { id: string; latDeg: number; lonDeg: number }[] }
const catalog = readSeed<CatalogIndex>("catalog/siteIndex.json").sites
const site = (id: string) => {
  const s = catalog.find((c) => c.id === id)!
  return { catalogId: id, latitudeDeg: s.latDeg, longitudeDeg: s.lonDeg }
}

describe("site samples from the stored ephemeris", () => {
  it("Chang'e 4 (far side): Earth never clears the horizon over a year", () => {
    const samples = siteSamples(YEAR, site("change-4-von-karman"), SMOOTH, START, START + 365 * 86_400_000)
    expect(samples.length).toBe(365 * 24 + 1)
    expect(samples.some(earthUp)).toBe(false)
    expect(Math.max(...samples.map((s) => s.earthEl))).toBeLessThan(-30)
    // ...but it still has normal lunar days
    expect(samples.filter(sunUp).length / samples.length).toBeGreaterThan(0.45)
  })

  it("Apollo 11 (near-side equator): Earth is always well above the horizon", () => {
    const samples = siteSamples(YEAR, site("apollo-11-tranquility"), SMOOTH, START, START + 30 * 86_400_000)
    expect(Math.min(...samples.map((s) => s.earthEl))).toBeGreaterThan(45)
  })

  it("matches lib/ephemeris topocentric math sample for sample", () => {
    const s = site("artemis-malapert-massif")
    const t = Date.parse("2027-03-14T05:00:00Z")
    const [sample] = siteSamples(YEAR, s, SMOOTH, t, t)
    const direct = azElFromCartesian(siteFrame(s.latitudeDeg, s.longitudeDeg), YEAR.at(t).sun)
    expect(sample.sunEl).toBeCloseTo(direct.elevationDeg, 10)
    expect(sample.sunAz).toBeCloseTo(direct.azimuthDeg, 10)
  })

  it("applies a terrain mask: the Sun counts as up only when it clears the terrain", () => {
    const mask: TerrainHorizon = { elevationsDeg: Array.from({ length: 360 }, () => 3), azimuthStepDeg: 1, source: "LOLA DEM" }
    expect(horizonAt(mask, 123.4)).toBeCloseTo(3, 10)
    const s = site("artemis-malapert-massif")
    const flat = siteSamples(YEAR, s, SMOOTH, START, START + 30 * 86_400_000)
    const ridged = siteSamples(YEAR, s, mask, START, START + 30 * 86_400_000)
    expect(ridged.filter(sunUp).length).toBeLessThan(flat.filter(sunUp).length)
    ridged.forEach((r) => expect(sunUp(r)).toBe(r.sunEl > 3))
  })

  it("polar seasons: sunlight per lunar day at Malapert varies through the year", () => {
    const days = summarizeByLunarDay(siteSamples(YEAR, site("artemis-malapert-massif"), SMOOTH, START, START + 365 * 86_400_000)).filter((d) => d.complete)
    expect(days).toHaveLength(12)
    const hours = days.map((d) => d.sunlightHours)
    expect(Math.max(...hours) - Math.min(...hours)).toBeGreaterThan(50)
  })
})

describe("orbit diagram geometry", () => {
  it("site day/night on the diagram agrees with the computed Sun elevation (libration included)", () => {
    const s = site("apollo-11-tranquility")
    let checked = 0
    for (let t = START; t < START + 60 * 86_400_000; t += 6 * 3_600_000) {
      const { sun, earth } = YEAR.at(t)
      const el = azElFromCartesian(siteFrame(s.latitudeDeg, s.longitudeDeg), sun).elevationDeg
      if (Math.abs(el) < 0.5) continue // parallax right at the terminator
      const g = orbitGeometry(sun, earth, s.latitudeDeg, s.longitudeDeg)
      // Sun is on +x, so the site faces the Sun when its projected x is positive.
      expect(g.site.x > 0).toBe(el > 0)
      checked++
    }
    expect(checked).toBeGreaterThan(200)
  })

  it("2026-12-01 is last quarter, about half lit", () => {
    const { sun, earth } = YEAR.at(Date.parse("2026-12-01T06:00:00Z"))
    const p = phase(orbitGeometry(sun, earth, 0, 0).moon)
    expect(p.name).toBe("Last quarter")
    expect(p.illuminated).toBeGreaterThan(0.4)
    expect(p.illuminated).toBeLessThan(0.6)
  })

  it("the Moon moves counter-clockwise around Earth in the Sun-fixed frame", () => {
    const t = Date.parse("2026-12-10T00:00:00Z")
    const a = orbitGeometry(YEAR.at(t).sun, YEAR.at(t).earth, 0, 0).moon
    const b = orbitGeometry(YEAR.at(t + 6 * 3_600_000).sun, YEAR.at(t + 6 * 3_600_000).earth, 0, 0).moon
    expect(a.x * b.y - a.y * b.x).toBeGreaterThan(0)
  })

  it("Earth–Moon distance stays within the real perigee/apogee range", () => {
    for (let t = START; t < START + 365 * 86_400_000; t += 86_400_000) {
      const d = orbitGeometry(YEAR.at(t).sun, YEAR.at(t).earth, 0, 0).earthDistanceKm
      expect(d).toBeGreaterThan(355_000)
      expect(d).toBeLessThan(407_000)
    }
  })
})
