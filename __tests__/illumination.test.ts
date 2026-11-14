import { describe, test, expect } from "@jest/globals"
import { parseHorizonsObserver } from "../lib/horizons"
import {
  buildTimeline, hoursUntilChange, irradiance, mergeSeries, sampleAt, summarizeByDay, SOLAR_CONSTANT_W_M2,
  type Sample,
} from "../lib/illumination"

const H = 3_600_000
const mk = (h: number, sunEl: number, earthEl = 5, sunAz = 0): Sample =>
  ({ t: h * H, sunAz, sunEl, sunRangeAu: 1, earthAz: 0, earthEl })

describe("parseHorizonsObserver flag column", () => {
  const raw = [
    "$$SOE",
    " 2026-Nov-14 00:00 *   126.619609   1.496957  0.98787543056046   0.2966886",
    " 2026-Nov-14 01:00 *i  126.111757   1.497682  0.98788262646271   0.3013550",
    " 2027-Feb-21 20:00     352.615295  -0.269527  0.99137017174750   0.2209546",
    " 2027-Feb-21 21:00  i  352.109619  -0.271163  0.99137538520292   0.2123400",
    "$$EOE",
  ].join("\n")

  test("parses rows with blank, *, i and *i flags", () => {
    const rows = parseHorizonsObserver(raw)
    expect(rows).toHaveLength(4)
    expect(rows[2].el).toBeCloseTo(-0.269527, 6)
  })

  test("reads Sun range in AU when QUANTITIES includes 20", () => {
    expect(parseHorizonsObserver(raw)[0].rangeAu).toBeCloseTo(0.98787543, 8)
  })
})

describe("irradiance", () => {
  test("zero when the Sun is below the horizon", () => {
    expect(irradiance(-1, 1, "vertical")).toBe(0)
  })
  test("horizontal panel scales with sin(elevation)", () => {
    expect(irradiance(30, 1, "horizontal")).toBeCloseTo(SOLAR_CONSTANT_W_M2 * 0.5, 6)
  })
  test("vertical Sun-facing panel scales with cos(elevation)", () => {
    expect(irradiance(1.5, 1, "vertical")).toBeCloseTo(SOLAR_CONSTANT_W_M2 * Math.cos((1.5 * Math.PI) / 180), 6)
  })
  test("inverse-square with Sun distance", () => {
    expect(irradiance(90, 0.98, "horizontal")).toBeCloseTo(SOLAR_CONSTANT_W_M2 / 0.98 ** 2, 6)
  })
})

describe("timeline", () => {
  // 6 h lit, 3 h dark, 3 h lit
  const samples = [...Array(12)].map((_, h) => mk(h, h >= 6 && h < 9 ? -1 : 10, h < 4 ? -2 : 3))
  const tl = buildTimeline(samples, 1, "horizontal")

  test("cumulative sunlight and longest darkness", () => {
    expect(tl.cumSunHours[11]).toBe(9)
    expect(tl.longestDarkHours[11]).toBe(3)
    expect(tl.longestDarkHours[5]).toBe(0)
  })

  test("Earth visibility and blackout", () => {
    expect(tl.cumEarthHours[11]).toBe(8)
    expect(tl.longestBlackoutHours[11]).toBe(4)
  })

  test("energy integrates irradiance over hours", () => {
    const perLitHour = irradiance(10, 1, "horizontal") / 1000
    expect(tl.cumEnergyKWh[11]).toBeCloseTo(perLitHour * 9, 9)
  })

  test("hours until sunset / sunrise", () => {
    expect(hoursUntilChange(samples, 0, 1, "sun")).toBe(6)
    expect(hoursUntilChange(samples, 6, 1, "sun")).toBe(3)
    expect(hoursUntilChange(samples, 9, 1, "sun")).toBeNull()
  })

  test("daily summary buckets 24 h windows", () => {
    const twoDays = [...Array(48)].map((_, h) => mk(h, h < 30 ? 5 : -5))
    const days = summarizeByDay(twoDays, buildTimeline(twoDays, 1, "vertical"))
    expect(days).toHaveLength(2)
    expect(days[0].sunlightHours).toBe(24)
    expect(days[1].sunlightHours).toBe(6)
  })
})

describe("interpolation", () => {
  test("azimuth wraps through north instead of sweeping backwards", () => {
    const s = sampleAt([mk(0, 1, 5, 350), mk(1, 3, 5, 10)], 0.5)
    expect(s.sunAz).toBeCloseTo(0, 6)
    expect(s.sunEl).toBeCloseTo(2, 6)
  })

  test("mergeSeries joins on timestamp", () => {
    const sun = [{ time: "2026-01-01T00:00:00.000Z", az: 1, el: 2, rangeAu: 0.99 }, { time: "2026-01-01T01:00:00.000Z", az: 1, el: 2 }]
    const earth = [{ time: "2026-01-01T00:00:00.000Z", az: 3, el: 4 }]
    const m = mergeSeries(sun, earth)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ sunRangeAu: 0.99, earthAz: 3, earthEl: 4 })
  })
})
