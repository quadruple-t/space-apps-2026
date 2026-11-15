import { describe, expect, it } from "vitest"
import type { Sample } from "@/lib/illumination"
import type { Placement } from "@/lib/drive-placements"
import { analyseHardware, windowsFrom } from "@/lib/hardware-analysis"
import { makeGrid } from "@/lib/terrain/dem"

function gridFrom(size: number, radiusKm: number, f: (e: number, n: number) => number) {
  const half = radiusKm * 1000, spacing = (2 * half) / (size - 1)
  const h = new Float32Array(size * size)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) h[j * size + i] = f(-half + i * spacing, half - j * spacing)
  return makeGrid(h, size, radiusKm)
}

const H = 3_600_000
/** 48 hourly samples: the Sun is in the east and up for 12 h each day; Earth is in the west and up for the middle 8 h. */
function samples(sunPeakEl = 40): Sample[] {
  return Array.from({ length: 48 }, (_, i) => ({
    t: Date.UTC(2026, 11, 1) + i * H,
    sunAz: 90, sunEl: sunPeakEl * Math.sin((2 * Math.PI * i) / 24), sunHorizon: 0, sunRangeAu: 1,
    earthAz: 270, earthEl: 25 * Math.sin((2 * Math.PI * (i - 8)) / 24), earthHorizon: 0,
  }))
}
const at = (type: Placement["type"], eastM = 0, northM = 0, id = type): Placement => ({ id, type, eastM, northM, headingDeg: 0 })

describe("windowsFrom", () => {
  it("finds contiguous runs and closes a run at the end of the data", () => {
    const xs = [0, H, 2 * H, 3 * H, 4 * H]
    const w = windowsFrom(xs, [false, true, true, false, true], H)
    expect(w).toEqual([{ startMs: H, endMs: 3 * H, hours: 2 }, { startMs: 4 * H, endMs: 5 * H, hours: 1 }])
  })
})

describe("hardware analysis on open ground", () => {
  const grid = gridFrom(33, 5, () => 0)
  const result = analyseHardware(grid, 0, samples(), [at("solar"), at("comms", 0, 100)])

  it("generates at the tracking-array rate whenever the Sun is up", () => {
    const [array] = result.solar
    expect(array.peakKw).toBeCloseTo((1361 * 18 * 0.3) / 1000, 1)
    // Sun centre exactly on the horizon: half the disc is visible. Well below it: nothing.
    expect(array.kw[0]).toBeCloseTo(array.peakKw / 2, 1)
    expect(array.kw[18]).toBe(0)
    expect(array.kw[6]).toBeGreaterThan(7)
    // Sun above the horizon about half of each day, over two days.
    expect(array.sunHours).toBeGreaterThan(22)
    expect(array.sunHours).toBeLessThan(25)
    expect(array.energyKWh).toBeCloseTo(array.sunHours * array.peakKw, -1)
  })

  it("opens communication windows while Earth is above the horizon", () => {
    const [mast] = result.comms
    expect(mast.windows.length).toBe(2)
    expect(mast.windows[0].hours).toBeGreaterThan(10)
    expect(mast.visibleHours).toBeGreaterThan(22)
    expect(mast.on[2]).toBe(false)
  })
})

describe("hardware analysis with terrain in the way", () => {
  // A 150 m ridge 300 m east of the site hides Sun lower than about 25°.
  const grid = gridFrom(65, 1, (e) => (e > 280 && e < 340 ? 150 : 0))
  const [array] = analyseHardware(grid, 0, samples(), [at("solar")]).solar
  const open = analyseHardware(gridFrom(65, 1, () => 0), 0, samples(), [at("solar")]).solar[0]

  it("loses generation while the Sun is below the ridge line", () => {
    expect(array.energyKWh).toBeLessThan(open.energyKWh * 0.9)
    // Sun at 20° is hidden; at 40° it clears the ridge.
    expect(array.kw[2]).toBe(0)
    expect(array.kw[6]).toBeGreaterThan(7)
  })

  it("sees the ridge differently from a spot on the far side of it", () => {
    const beyond = analyseHardware(grid, 0, samples(), [at("solar", 500, 0)]).solar[0]
    expect(beyond.kw[2]).toBeGreaterThan(0)
  })
})
