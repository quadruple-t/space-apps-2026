/**
 * The API handlers and Freeplay's graphs both evaluate the sky through lib/science/sky.
 * These tests pin that evaluation against an independent statement of the original
 * algorithm (azElFromCartesian + isAboveMask), at the same sites, times, horizon sources
 * and coverage boundaries, so a change to either path cannot drift silently.
 */
import { describe, expect, it } from "vitest"
import { CartesianSeries, azElFromCartesian, siteFrame } from "@/lib/ephemeris"
import { siteSamples, type TerrainHorizon } from "@/lib/lunar-data"
import { longestRunHours, skySamples } from "@/lib/science/sky"
import { isAboveMask, smoothHorizonMask } from "@/lib/terrain"
import type { HorizonMask } from "@/lib/model/types"
import { loadChunk } from "./helpers/seed"

const series = new CartesianSeries(["2027-01", "2027-02", "2027-03"].map(loadChunk))
const START = Date.parse("2027-01-10T00:00:00Z")
const END = START + 24 * 3_600_000

const ridge = Float32Array.from({ length: 360 }, (_, i) => (i > 60 && i < 140 ? 12 : 1.5)) // east-ish ridge
const SITES = [
  { name: "equatorial", lat: 0.67416, lon: 23.47314 },
  { name: "polar", lat: -89.5, lon: 10 },
]
const HORIZONS: { name: string; profile: TerrainHorizon; mask: HorizonMask }[] = [
  { name: "smooth", profile: { elevationsDeg: null, azimuthStepDeg: 1, source: "none — smooth horizon" }, mask: smoothHorizonMask() },
  { name: "masked", profile: { elevationsDeg: Array.from(ridge), azimuthStepDeg: 1, source: "LOLA DEM" }, mask: { ...smoothHorizonMask(), source: "LOLA DEM", maskElevationDeg: ridge } },
]

describe.each(SITES)("sky evaluation at $name site", (site) => {
  const frame = siteFrame(site.lat, site.lon)
  describe.each(HORIZONS)("with $name horizon", ({ profile, mask }) => {
    it("matches the reference visibility decision and the client samples", () => {
      const shared = skySamples(series, frame, profile, START, END, 10)
      const client = siteSamples(series, { latitudeDeg: site.lat, longitudeDeg: site.lon }, profile, START, END, 10)
      expect(shared.length).toBe(145)
      expect(client.length).toBe(shared.length)
      shared.forEach((p, i) => {
        const { sun, earth } = series.at(p.t)
        const s = azElFromCartesian(frame, sun), e = azElFromCartesian(frame, earth)
        expect(p.sunVisible).toBe(isAboveMask(mask, s.azimuthDeg, s.elevationDeg))
        expect(p.earthVisible).toBe(isAboveMask(mask, e.azimuthDeg, e.elevationDeg))
        expect(p.sunEl).toBeCloseTo(s.elevationDeg, 9)
        expect(client[i].sunEl).toBe(p.sunEl)
        expect(client[i].earthHorizon).toBe(p.earthHorizon)
        expect(client[i].sunEl > client[i].sunHorizon).toBe(p.sunVisible)
        expect(client[i].earthEl > client[i].earthHorizon).toBe(p.earthVisible)
      })
    })
  })
})

describe("coverage boundaries", () => {
  it("clamps samples to the loaded series on both sides", () => {
    const frame = siteFrame(0, 0)
    const h = { elevationsDeg: null, azimuthStepDeg: 1 }
    const out = skySamples(series, frame, h, series.startMs - 6 * 3_600_000, series.startMs + 3_600_000, 60)
    expect(out[0].t).toBe(series.startMs)
    const tail = skySamples(series, frame, h, series.endMs - 3_600_000, series.endMs + 6 * 3_600_000, 60)
    expect(tail.at(-1)!.t).toBeLessThanOrEqual(series.endMs)
  })
})

describe("run lengths", () => {
  it("reports the longest run in hours", () => {
    expect(longestRunHours([true, false, false, false, true, false], false, 1 / 6)).toBe(0.5)
    expect(longestRunHours([true, true], false, 1)).toBe(0)
  })
})
