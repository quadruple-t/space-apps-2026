import { describe, expect, it } from "vitest"
import {
  MAX_TRANSIT_DAYS, PARKING_ORBIT_RADIUS_KM, TRAJECTORY_TRANSIT_RANGE_DAYS, planTrajectory, positionAt, radialFraction, sunriseAlignment,
  type MoonState,
} from "@/lib/engine/trajectory"

const DAY = 86_400_000
const T0 = Date.parse("2026-12-01T00:00:00Z")
const SYNODIC_DAYS = 29.530589

/** Circular Moon, slightly eccentric distance, moving counter-clockwise in the Sun-fixed frame. */
const moonAt = (t: number): MoonState => ({
  distanceKm: 384_400 + 20_000 * Math.sin(((t - T0) / DAY / 27.55) * 2 * Math.PI),
  angleRad: 0.7 + (2 * Math.PI * (t - T0)) / DAY / SYNODIC_DAYS,
})
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

describe("planTrajectory", () => {
  it("direct transfer takes 3 to 5 days", () => {
    const p = planTrajectory("direct", T0, moonAt)!
    const days = p.transitSeconds / 86_400
    expect(days).toBeGreaterThan(TRAJECTORY_TRANSIT_RANGE_DAYS.direct[0])
    expect(days).toBeLessThan(TRAJECTORY_TRANSIT_RANGE_DAYS.direct[1])
    expect(days).toBeLessThan(MAX_TRANSIT_DAYS.direct)
  })

  it("low-energy transfer takes 1 to 4 months", () => {
    const p = planTrajectory("low-energy", T0, moonAt)!
    const days = p.transitSeconds / 86_400
    expect(days).toBeGreaterThan(30)
    expect(days).toBeLessThan(120)
    expect(p.apogeeKm).toBeGreaterThan(1_000_000)
  })

  it("starts at the parking orbit and ends at the Moon's position at ARRIVAL, not at launch", () => {
    for (const type of ["direct", "low-energy"] as const) {
      const p = planTrajectory(type, T0, moonAt)!
      const first = p.path[0], last = p.path[p.path.length - 1]
      expect(first.rKm).toBeCloseTo(PARKING_ORBIT_RADIUS_KM, 3)
      const moonArrival = moonAt(p.arrivalMs), moonLaunch = moonAt(T0)
      expect(p.arrivalMs - T0).toBeCloseTo(p.transitSeconds * 1000, -1)
      expect(last.rKm).toBeCloseTo(moonArrival.distanceKm, 2)
      expect(wrap(last.angleRad - moonArrival.angleRad)).toBeCloseTo(0, 6)
      // the Moon has moved well away from where it was at launch
      expect(Math.abs(wrap(last.angleRad - moonLaunch.angleRad))).toBeGreaterThan(0.3)
    }
  })

  it("the arc stays continuous and converges on the Moon before arrival (no jump at the end)", () => {
    const p = planTrajectory("direct", T0, moonAt, 600)!
    const pre = p.path[p.path.length - 2], last = p.path[p.path.length - 1]
    const gap = Math.hypot(pre.rKm - last.rKm, last.rKm * wrap(pre.angleRad - last.angleRad))
    expect(gap).toBeLessThan(5_000) // km: the pin moves the final sample by less than one step
  })

  it("changing the launch date changes the aim point", () => {
    const a = planTrajectory("direct", T0, moonAt)!
    const b = planTrajectory("direct", T0 + 5 * DAY, moonAt)!
    expect(Math.abs(wrap(a.arrivalAngleRad - b.arrivalAngleRad))).toBeGreaterThan(0.5)
    expect(b.arrivalMs).toBeGreaterThan(a.arrivalMs)
  })

  it("returns null when the ephemeris does not cover arrival", () => {
    expect(planTrajectory("direct", T0, (t) => (t > T0 + DAY ? null : moonAt(t)))).toBeNull()
  })
})

describe("positionAt (marker)", () => {
  const plan = planTrajectory("direct", T0, moonAt)!
  it("waits at the parking orbit before launch and sits on the Moon after arrival", () => {
    expect(positionAt(plan, T0 - DAY).phase).toBe("before")
    const end = positionAt(plan, plan.arrivalMs + DAY)
    expect(end.phase).toBe("arrived")
    expect(end.rKm).toBeCloseTo(plan.arrivalDistanceKm, 3)
  })
  it("moves outward monotonically in radius during the outbound leg", () => {
    let prev = 0
    for (let k = 1; k <= 20; k++) {
      const p = positionAt(plan, T0 + (plan.transitSeconds * 1000 * k) / 21)
      expect(p.phase).toBe("transit")
      expect(p.rKm).toBeGreaterThan(prev)
      prev = p.rKm
    }
  })
  it("agrees with the sampled path", () => {
    const mid = plan.path[150]
    const p = positionAt(plan, plan.launchMs + mid.tSeconds * 1000)
    expect(p.rKm).toBeCloseTo(mid.rKm, 3)
    expect(wrap(p.angleRad - mid.angleRad)).toBeCloseTo(0, 9)
  })
})

describe("radialFraction", () => {
  it("is 0 at the parking orbit, 1 at the Moon, and compressed beyond", () => {
    expect(radialFraction(PARKING_ORBIT_RADIUS_KM, 384_400)).toBe(0)
    expect(radialFraction(384_400, 384_400)).toBe(1)
    const far = radialFraction(1_500_000, 384_400)
    expect(far).toBeGreaterThan(1)
    expect(far).toBeLessThan(1.12)
  })
})

describe("sunriseAlignment", () => {
  // Sun up for 14 days, down for 14 days, starting with sunrise at day 0
  const samples = Array.from({ length: 24 * 90 }, (_, h) => ({ t: T0 + h * 3_600_000, sunUp: (h / 24) % 28 < 14 && h > 0 }))
  it("flags arrival within 3 days after sunrise", () => {
    const a = sunriseAlignment(samples, T0 + 28 * DAY + 2 * DAY)!
    expect(a.sunUpAtArrival).toBe(true)
    expect(a.nearSunrise).toBe(true)
    expect(a.hoursSincePrevSunrise).toBeCloseTo(48, 0)
  })
  it("does not flag mid-day arrival and reports time to next sunrise at night", () => {
    expect(sunriseAlignment(samples, T0 + 7 * DAY)!.nearSunrise).toBe(false)
    const night = sunriseAlignment(samples, T0 + 20 * DAY)!
    expect(night.sunUpAtArrival).toBe(false)
    expect(night.hoursUntilNextSunrise).toBeCloseTo(8 * 24, 0)
    expect(night.nearSunrise).toBe(false)
  })
  it("returns null outside the data", () => {
    expect(sunriseAlignment(samples, T0 - DAY)).toBeNull()
  })
})
