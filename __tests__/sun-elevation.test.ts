/**
 * Apollo 11 Sun-elevation benchmark.
 * Horizons OBSERVER, CENTER=coord@301, site 0.6741°N 23.4732°E.
 * Expected: ~10–11° per ALSJ. Confirmed live query: 10.698°.
 */
import { describe, test, expect } from "@jest/globals"
import { readFileSync } from "fs"
import { join } from "path"
import { parseHorizonsObserver, horizonsDateToISO, isoToHorizons } from "../lib/horizons"

const cachePath = join(process.cwd(), "public", "data", "horizons", "apollo11-sun.json")
const cached = JSON.parse(readFileSync(cachePath, "utf8"))

describe("Horizons parser", () => {
  test("parses $$SOE / $$EOE block into entries", () => {
    const entries = parseHorizonsObserver(cached.raw)
    expect(entries.length).toBeGreaterThanOrEqual(3)
  })

  test("Apollo 11 landing: Sun elevation is ~10–11° (ALSJ benchmark)", () => {
    const entries = parseHorizonsObserver(cached.raw)
    const landing = entries.find((e) => e.time === "1969-07-20T20:17:00.000Z")
    expect(landing).toBeDefined()
    expect(landing!.el).toBeCloseTo(10.698, 2)
    expect(landing!.el).toBeGreaterThan(10)
    expect(landing!.el).toBeLessThan(12)
  })

  test("Sun azimuth is ~89° (east-northeast at landing)", () => {
    const entries = parseHorizonsObserver(cached.raw)
    const landing = entries.find((e) => e.time === "1969-07-20T20:17:00.000Z")!
    expect(landing.az).toBeCloseTo(88.8, 0)
  })

  test("cached entries match parsed values", () => {
    const parsed = parseHorizonsObserver(cached.raw)
    for (const ce of cached.entries) {
      const p = parsed.find((e) => e.time === ce.time)
      expect(p).toBeDefined()
      expect(p!.az).toBeCloseTo(ce.az, 4)
      expect(p!.el).toBeCloseTo(ce.el, 4)
    }
  })
})

describe("Date conversion helpers", () => {
  test("horizonsDateToISO converts Horizons format to ISO-8601", () => {
    expect(horizonsDateToISO("1969-Jul-20 20:17")).toBe("1969-07-20T20:17:00.000Z")
    expect(horizonsDateToISO("2026-Nov-14 12:00")).toBe("2026-11-14T12:00:00.000Z")
  })

  test("isoToHorizons converts ISO-8601 to Horizons format", () => {
    expect(isoToHorizons("1969-07-20T20:17:00.000Z")).toBe("1969-Jul-20 20:17")
    expect(isoToHorizons("2026-11-14T12:00:00.000Z")).toBe("2026-Nov-14 12:00")
  })

  test("roundtrip: isoToHorizons → horizonsDateToISO", () => {
    const iso = "2026-11-14T12:00:00.000Z"
    expect(horizonsDateToISO(isoToHorizons(iso))).toBe(iso)
  })
})
