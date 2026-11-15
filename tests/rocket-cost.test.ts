import { describe, expect, it } from "vitest"
import { DEFAULT_ISP_S, DELTA_V, G0_M_S2, deltaVBudget } from "@/lib/engine/deltav"
import { estimateMission } from "@/lib/engine/mission-estimate"
import { LAUNCH_CLASSES, formatUsdRange, launchClassFor, launchCostRange, roundUsd } from "@/lib/engine/launch-costs"
import { propellantKg, stackMassKg, wetMassKg } from "@/lib/engine/rocket"

describe("rocket equation", () => {
  it("matches m_wet = m_dry * exp(dv / (Isp g0))", () => {
    expect(wetMassKg(1000, 0, 300)).toBe(1000)
    // dv = Isp * g0 gives a mass ratio of e
    expect(wetMassKg(1000, (300 * G0_M_S2) / 1000, 300)).toBeCloseTo(1000 * Math.E, 6)
    // 3 km/s at 311 s: exp(3000 / (311 * 9.80665)) = 2.6734...
    expect(wetMassKg(1, 3, 311)).toBeCloseTo(Math.exp(3000 / (311 * 9.80665)), 10)
  })

  it("propellant is wet minus dry and grows with delta-v and falls with Isp", () => {
    expect(propellantKg(500, 3, 311)).toBeCloseTo(wetMassKg(500, 3, 311) - 500, 9)
    expect(propellantKg(500, 4, 311)).toBeGreaterThan(propellantKg(500, 3, 311))
    expect(propellantKg(500, 3, 450)).toBeLessThan(propellantKg(500, 3, 311))
  })

  it("rejects invalid inputs", () => {
    expect(() => wetMassKg(-1, 1, 300)).toThrow(RangeError)
    expect(() => wetMassKg(1, 1, 0)).toThrow(RangeError)
    expect(() => wetMassKg(1, -1, 300)).toThrow(RangeError)
  })

  it("chained burns equal one burn of the summed delta-v", () => {
    const { leoMassKg, massBeforeBurnKg } = stackMassKg(500, [3, 1, 2], 311)
    expect(leoMassKg).toBeCloseTo(wetMassKg(500, 6, 311), 6)
    expect(massBeforeBurnKg[2]).toBeCloseTo(wetMassKg(500, 2, 311), 6)
    expect(massBeforeBurnKg[0]).toBe(leoMassKg)
  })
})

describe("delta-v config", () => {
  it("each phase is ordered low <= nominal <= high", () => {
    for (const type of Object.keys(DELTA_V) as (keyof typeof DELTA_V)[])
      for (const v of Object.values(DELTA_V[type])) {
        expect(v.lowKmS).toBeLessThanOrEqual(v.nominalKmS)
        expect(v.nominalKmS).toBeLessThanOrEqual(v.highKmS)
      }
  })

  it("low-energy transfer lowers the insertion cost and the total", () => {
    const d = deltaVBudget("direct"), l = deltaVBudget("low-energy")
    expect(l.phases.find((p) => p.id === "loi")!.kmS).toBeLessThan(d.phases.find((p) => p.id === "loi")!.kmS)
    expect(l.totalKmS).toBeLessThan(d.totalKmS)
    expect(d.totalKmS).toBeCloseTo(3.15 + 0.9 + 1.95, 9)
  })
})

describe("launch cost", () => {
  it("maps mass to the smallest class that carries it", () => {
    expect(launchClassFor(250)?.id).toBe("small")
    expect(launchClassFor(300.1)?.id).toBe("medium")
    expect(launchClassFor(22_800)?.id).toBe("medium")
    expect(launchClassFor(40_000)?.id).toBe("heavy")
    expect(launchClassFor(100_000)).toBeNull()
  })

  it("returns a range, never a single price", () => {
    for (const mass of [100, 3_000, 30_000]) {
      const c = launchCostRange(mass)!
      expect(c.highUsd).toBeGreaterThan(c.lowUsd)
    }
    const c = launchCostRange(3_600)!
    expect(c.lowUsd).toBeCloseTo(3_600 * 2_940, 0)
    expect(c.highUsd).toBe(LAUNCH_CLASSES[1].launchPriceUsd.high)
  })

  it("has no estimate above the largest class", () => {
    expect(launchCostRange(70_000)).toBeNull()
  })

  it("rounds to 2 significant figures and formats a range", () => {
    expect(roundUsd(10_584_000)).toBe(11_000_000)
    expect(formatUsdRange(10_584_000, 75_000_000)).toBe("$11.0M to $75.0M")
  })
})

describe("estimateMission", () => {
  it("default 500 kg lander: direct needs about 3.6 t in LEO and lands in the Falcon 9 class", () => {
    const e = estimateMission("direct")
    expect(DEFAULT_ISP_S).toBe(311)
    expect(e.leoMassKg).toBeCloseTo(500 * Math.exp(6.0e3 / (311 * G0_M_S2)), 3)
    expect(e.propellantKg).toBeCloseTo(e.leoMassKg - 500, 6)
    expect(e.phasePropellantKg.reduce((s, x) => s + x, 0)).toBeCloseTo(e.propellantKg, 6)
    expect(e.cost?.launchClass.id).toBe("medium")
    expect(e.leoMassRangeKg.low).toBeLessThan(e.leoMassKg)
    expect(e.leoMassRangeKg.high).toBeGreaterThan(e.leoMassKg)
  })

  it("low-energy needs less propellant than direct for the same lander and Isp", () => {
    expect(estimateMission("low-energy").propellantKg).toBeLessThan(estimateMission("direct").propellantKg)
  })

  it("scales with payload mass and Isp", () => {
    expect(estimateMission("direct", 1000).leoMassKg).toBeCloseTo(2 * estimateMission("direct", 500).leoMassKg, 6)
    expect(estimateMission("direct", 500, 450).leoMassKg).toBeLessThan(estimateMission("direct", 500, 311).leoMassKg)
  })
})
