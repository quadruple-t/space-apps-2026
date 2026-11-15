/**
 * Patched-conic style Earth-to-Moon transfer geometry for the Orbit diagram.
 *
 * APPROXIMATION: a single two-body Kepler arc about Earth in the Moon's orbital plane, aimed at
 * where the Moon will be at arrival. No lunar gravity, no Sun perturbation, no n-body
 * propagation. The low-energy arc is an illustrative high-apogee loop, not a real weak-stability
 * trajectory. Constants are listed in docs/SOURCES.md section 8.
 *
 * Frames: angles are in the Orbit diagram's Sun-fixed frame (Sun on +x, counter-clockwise
 * positive, lib/orbit.ts). The Earth-centred arc is computed in a frame fixed at launch, so the
 * Sun's apparent drift (SUN_MEAN_MOTION_DEG_DAY) is added going in and removed coming out.
 */

import type { TrajectoryType } from "./deltav"

const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI
const DAY_S = 86_400

/** Earth GM, km^3/s^2. SOURCES: GEO-1. */
export const EARTH_MU_KM3_S2 = 398_600.4418
/** Earth equatorial radius, km. SOURCES: GEO-2. */
export const EARTH_RADIUS_KM = 6_378.137
/** Assumed circular parking orbit altitude, km. SOURCES: GEO-3. */
export const PARKING_ORBIT_ALTITUDE_KM = 185
export const PARKING_ORBIT_RADIUS_KM = EARTH_RADIUS_KM + PARKING_ORBIT_ALTITUDE_KM
/** Mean Moon distance, km. SOURCES: GEO-4. */
export const MEAN_EARTH_MOON_KM = 384_400
/** Direct transfer apogee as a multiple of the Moon's distance at arrival. SOURCES: GEO-5. */
export const DIRECT_APOGEE_FACTOR = 1.1
/** Low-energy loop apogee, km (about the Sun-Earth L1 region). SOURCES: GEO-6. */
export const LOW_ENERGY_APOGEE_KM = 1_500_000
/** Mean apparent motion of the Sun, deg/day. SOURCES: GEO-7. */
export const SUN_MEAN_MOTION_DEG_DAY = 360 / 365.2422

export const TRAJECTORY_TRANSIT_RANGE_DAYS: Record<TrajectoryType, [number, number]> = {
  direct: [3, 5],
  "low-energy": [30, 120],
}

/** Longest transit we search for (days), used to size ephemeris windows. */
export const MAX_TRANSIT_DAYS: Record<TrajectoryType, number> = { direct: 7, "low-energy": 130 }

/** Moon state the planner needs at an instant. */
export type MoonState = {
  /** Earth-Moon distance, km */
  distanceKm: number
  /** Moon direction from Earth in the Sun-fixed diagram frame, radians (atan2(y, x)) */
  angleRad: number
}

export type TrajectoryPlan = {
  type: TrajectoryType
  launchMs: number
  arrivalMs: number
  transitSeconds: number
  /** Earth-Moon distance at arrival, km */
  arrivalDistanceKm: number
  /** Moon direction at arrival in the diagram frame, radians */
  arrivalAngleRad: number
  semiMajorKm: number
  eccentricity: number
  apogeeKm: number
  /** Inertial angle (launch-fixed frame) of the departure burn point, radians */
  departureAngleRad: number
  /** Sampled path in the diagram frame */
  path: PathPoint[]
}

export type PathPoint = { tSeconds: number; rKm: number; angleRad: number }

function keplerE(M: number, e: number): number {
  // Bisection on E - e sin E = M over [0, 2 pi]: monotonic and safe for e close to 1.
  let lo = 0, hi = TWO_PI
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2
    if (mid - e * Math.sin(mid) < M) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

type Conic = { a: number; e: number; n: number; p: number }

function conic(rpKm: number, raKm: number): Conic {
  const a = (rpKm + raKm) / 2
  const e = (raKm - rpKm) / (raKm + rpKm)
  return { a, e, n: Math.sqrt(EARTH_MU_KM3_S2 / a ** 3), p: a * (1 - e * e) }
}

/** Radius (km) and true anomaly (0..2 pi) at `t` seconds after periapsis. */
export function conicAt(c: Conic, tSeconds: number): { rKm: number; nu: number } {
  const M = ((c.n * tSeconds) % TWO_PI + TWO_PI) % TWO_PI
  const E = keplerE(M, c.e)
  const nu = 2 * Math.atan2(Math.sqrt(1 + c.e) * Math.sin(E / 2), Math.sqrt(1 - c.e) * Math.cos(E / 2))
  return { rKm: c.a * (1 - c.e * Math.cos(E)), nu: (nu + TWO_PI) % TWO_PI }
}

/** Seconds after periapsis at which the arc is at radius r on the outbound (or inbound) leg. */
function timeAtRadius(c: Conic, rKm: number, inbound: boolean): { t: number; nu: number } {
  const cosNu = Math.max(-1, Math.min(1, (c.p / rKm - 1) / c.e))
  const nuOut = Math.acos(cosNu)
  const nu = inbound ? TWO_PI - nuOut : nuOut
  const E = 2 * Math.atan2(Math.sqrt(1 - c.e) * Math.sin(nu / 2), Math.sqrt(1 + c.e) * Math.cos(nu / 2))
  const Ewrapped = (E + TWO_PI) % TWO_PI
  return { t: (Ewrapped - c.e * Math.sin(Ewrapped)) / c.n, nu }
}

function arcFor(type: TrajectoryType, arrivalDistanceKm: number) {
  const raKm = type === "direct" ? DIRECT_APOGEE_FACTOR * arrivalDistanceKm : LOW_ENERGY_APOGEE_KM
  const c = conic(PARKING_ORBIT_RADIUS_KM, raKm)
  const hit = timeAtRadius(c, arrivalDistanceKm, type === "low-energy")
  return { c, raKm, transitSeconds: hit.t, nuArrival: hit.nu }
}

const sunDriftRad = (seconds: number) => SUN_MEAN_MOTION_DEG_DAY * DEG * (seconds / DAY_S)

/**
 * Plan a transfer departing at `launchMs` and arriving at the Moon's position at the arrival time.
 * The arrival time depends on the Moon's distance then, so it is found by fixed-point iteration.
 * Returns null when `moonAt` has no data (outside the stored ephemeris) for the arrival time.
 */
export function planTrajectory(type: TrajectoryType, launchMs: number, moonAt: (tMs: number) => MoonState | null, samples = 300): TrajectoryPlan | null {
  let transit = arcFor(type, MEAN_EARTH_MOON_KM).transitSeconds
  let moon: MoonState | null = null
  let arc = arcFor(type, MEAN_EARTH_MOON_KM)
  for (let i = 0; i < 8; i++) {
    moon = moonAt(launchMs + transit * 1000)
    if (!moon) return null
    arc = arcFor(type, moon.distanceKm)
    if (Math.abs(arc.transitSeconds - transit) < 1) { transit = arc.transitSeconds; break }
    transit = arc.transitSeconds
  }
  moon = moonAt(launchMs + transit * 1000)
  if (!moon) return null
  arc = arcFor(type, moon.distanceKm)
  transit = arc.transitSeconds

  // Inertial (launch-fixed) angle of the Moon at arrival, then the periapsis direction that hits it.
  const arrivalInertial = moon.angleRad + sunDriftRad(transit)
  const departureAngleRad = arrivalInertial - arc.nuArrival

  const path: PathPoint[] = []
  for (let k = 0; k <= samples; k++) {
    const t = (transit * k) / samples
    const { rKm, nu } = conicAt(arc.c, t)
    path.push({ tSeconds: t, rKm, angleRad: departureAngleRad + nu - sunDriftRad(t) })
  }
  // Pin the final point exactly on the Moon to remove interpolation noise.
  path[path.length - 1] = { tSeconds: transit, rKm: moon.distanceKm, angleRad: moon.angleRad }

  return {
    type, launchMs, arrivalMs: launchMs + transit * 1000, transitSeconds: transit,
    arrivalDistanceKm: moon.distanceKm, arrivalAngleRad: moon.angleRad,
    semiMajorKm: arc.c.a, eccentricity: arc.c.e, apogeeKm: arc.raKm, departureAngleRad, path,
  }
}

/** Spacecraft position (diagram frame) at an absolute time; null before launch, Moon position after arrival. */
export function positionAt(plan: TrajectoryPlan, tMs: number): { rKm: number; angleRad: number; phase: "before" | "transit" | "arrived" } {
  const t = (tMs - plan.launchMs) / 1000
  if (t <= 0) return { rKm: PARKING_ORBIT_RADIUS_KM, angleRad: plan.path[0].angleRad, phase: "before" }
  if (t >= plan.transitSeconds) return { rKm: plan.arrivalDistanceKm, angleRad: plan.arrivalAngleRad, phase: "arrived" }
  const c = arcFor(plan.type, plan.arrivalDistanceKm).c
  const { rKm, nu } = conicAt(c, t)
  return { rKm, angleRad: plan.departureAngleRad + nu - sunDriftRad(t), phase: "transit" }
}

/**
 * Radial display scale for the not-to-scale diagram: 0 at the parking orbit, 1 at the Moon's distance
 * at arrival (linear), compressed beyond so a 1.5 million km loop stays on screen (max 1.12).
 */
export function radialFraction(rKm: number, arrivalDistanceKm: number): number {
  const f = (rKm - PARKING_ORBIT_RADIUS_KM) / (arrivalDistanceKm - PARKING_ORBIT_RADIUS_KM)
  if (f <= 1) return Math.max(0, f)
  return 1 + 0.12 * Math.tanh((f - 1) / 1.2)
}

// ---------------------------------------------------------------------------------------------
// Local sunrise at the selected site relative to arrival

/** Arrival within this many hours of a local sunrise counts as "near sunrise". Heuristic. SOURCES: ASM-1. */
export const NEAR_SUNRISE_HOURS = 72

export type SunSample = { t: number; sunUp: boolean }

export type SunriseAlignment = {
  sunUpAtArrival: boolean
  /** Hours from the latest sunrise at or before arrival to arrival; null when none in the data. */
  hoursSincePrevSunrise: number | null
  /** Hours from arrival to the next sunrise; null when none in the data. */
  hoursUntilNextSunrise: number | null
  nearSunrise: boolean
  summary: string
}

const fmtDays = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`)

export function sunriseAlignment(samples: SunSample[], arrivalMs: number): SunriseAlignment | null {
  if (samples.length < 2 || arrivalMs < samples[0].t || arrivalMs > samples[samples.length - 1].t) return null
  const sunrises: number[] = []
  for (let i = 1; i < samples.length; i++) if (!samples[i - 1].sunUp && samples[i].sunUp) sunrises.push(samples[i].t)
  let idx = 0
  while (idx < samples.length - 1 && samples[idx + 1].t <= arrivalMs) idx++
  const sunUpAtArrival = samples[idx].sunUp
  const prev = [...sunrises].reverse().find((t) => t <= arrivalMs)
  const next = sunrises.find((t) => t > arrivalMs)
  const since = prev === undefined ? null : (arrivalMs - prev) / 3_600_000
  const until = next === undefined ? null : (next - arrivalMs) / 3_600_000
  const nearSunrise = (since !== null && since <= NEAR_SUNRISE_HOURS) || (until !== null && until <= NEAR_SUNRISE_HOURS)
  let summary: string
  if (sunUpAtArrival) {
    summary = since === null ? "Sun is up at arrival." : `Sun is up at arrival, ${fmtDays(since)} after local sunrise.`
  } else {
    summary = until === null ? "Sun is down at arrival." : `Sun is down at arrival; local sunrise follows in ${fmtDays(until)}.`
  }
  return { sunUpAtArrival, hoursSincePrevSunrise: since, hoursUntilNextSunrise: until, nearSunrise, summary }
}
