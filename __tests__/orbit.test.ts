import { describe, expect, test } from "@jest/globals"
import { readFileSync } from "fs"
import { join } from "path"
import { phase, siteAngle, toSunFrame, vectorAt } from "../lib/orbit"

type Row = [string, number, number, number]
const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "apollo11-dec2026.json"), "utf8")) as {
  sun: [string, number, number][]; moon: Row[]; sunVec: Row[]
}
const series = (rows: Row[]) => rows.map(([time, x, y, z]) => ({ time, x, y, z }))
const moon = series(fx.moon), sun = series(fx.sunVec)
const APOLLO11_LON = 23.47314

describe("orbit diagram geometry vs JPL Horizons", () => {
  // The diagram ignores libration (up to ~8° in longitude), so the site's drawn
  // position can be off by that much; its day/night colour comes from Horizons.
  const LIBRATION_DEG = 8

  test("site position in the diagram matches Horizons Sun elevation at Apollo 11 to within libration", () => {
    let checked = 0
    for (const [time, , el] of fx.sun) {
      const t = Date.parse(time)
      const m = toSunFrame(vectorAt(moon, t)!, vectorAt(sun, t)!)
      // Sun on +x: an equatorial site's Sun elevation is asin(cos(angle)).
      const diagramEl = (Math.asin(Math.cos(siteAngle(m, APOLLO11_LON))) * 180) / Math.PI
      expect(Math.abs(diagramEl - el)).toBeLessThan(LIBRATION_DEG)
      if (Math.abs(el) > LIBRATION_DEG) { expect(diagramEl > 0).toBe(el > 0); checked++ }
    }
    expect(checked).toBeGreaterThan(90)
  })

  test("phase on 2026-12-01 is last quarter (waning, about half lit)", () => {
    const t = Date.parse("2026-12-01T06:00:00Z")
    const p = phase(toSunFrame(vectorAt(moon, t)!, vectorAt(sun, t)!))
    expect(p.name).toBe("Last quarter")
    expect(p.illuminated).toBeGreaterThan(0.4)
    expect(p.illuminated).toBeLessThan(0.6)
  })

  test("Moon moves counter-clockwise in the Sun-fixed frame", () => {
    const t = Date.parse("2026-12-10T00:00:00Z")
    const a = toSunFrame(vectorAt(moon, t)!, vectorAt(sun, t)!)
    const b = toSunFrame(vectorAt(moon, t + 6 * 3_600_000)!, vectorAt(sun, t + 6 * 3_600_000)!)
    expect(a.x * b.y - a.y * b.x).toBeGreaterThan(0)
  })

  test("vectorAt interpolates and clamps", () => {
    const s = [{ time: "2026-01-01T00:00:00.000Z", x: 0, y: 0, z: 0 }, { time: "2026-01-01T01:00:00.000Z", x: 10, y: 20, z: 30 }]
    expect(vectorAt(s, Date.parse("2026-01-01T00:30:00Z"))).toEqual({ x: 5, y: 10, z: 15 })
    expect(vectorAt(s, Date.parse("2025-12-31T00:00:00Z"))).toEqual({ x: 0, y: 0, z: 0 })
  })
})
