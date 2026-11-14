import { describe, test, expect } from "vitest"
import {
  buildTimeline, hoursUntilChange, irradiance, irradianceAt, sampleAt, summarizeByDay, summarizeByLunarDay, sunUp,
  SOLAR_CONSTANT_W_M2, SYNODIC_MONTH_HOURS, type Sample,
} from "@/lib/illumination"

const H = 3_600_000
const mk = (h: number, sunEl: number, earthEl = 5, sunAz = 0, sunHorizon = 0): Sample =>
  ({ t: h * H, sunAz, sunEl, sunHorizon, sunRangeAu: 1, earthAz: 0, earthEl, earthHorizon: 0 })

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
  test("terrain above the Sun blocks it even when it's above the flat horizon", () => {
    const blocked = mk(0, 2, 5, 90, 3.5)
    expect(sunUp(blocked)).toBe(false)
    expect(irradianceAt(blocked, "vertical")).toBe(0)
    expect(irradianceAt(mk(0, 2, 5, 90, 1), "vertical")).toBeGreaterThan(1300)
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

describe("lunar-day summary", () => {
  test("buckets a year into 12 full lunar days plus a partial one", () => {
    const year = [...Array(365 * 24 + 1)].map((_, h) => mk(h, Math.sin((2 * Math.PI * h) / SYNODIC_MONTH_HOURS) * 10, h % 2 ? 1 : -1))
    const days = summarizeByLunarDay(year)
    expect(days).toHaveLength(13)
    expect(days.filter((d) => d.complete)).toHaveLength(12)
    expect(days[0].sunlightHours).toBeGreaterThan(350)
    expect(days[0].sunlightHours).toBeLessThan(360)
    expect(days[0].maxSunEl).toBeCloseTo(10, 1)
    expect(days[0].earthVisiblePct).toBeCloseTo(50, 0)
  })
})

describe("interpolation", () => {
  test("azimuth wraps through north instead of sweeping backwards", () => {
    const s = sampleAt([mk(0, 1, 5, 350), mk(1, 3, 5, 10)], 0.5)
    expect(s.sunAz).toBeCloseTo(0, 6)
    expect(s.sunEl).toBeCloseTo(2, 6)
  })

})
