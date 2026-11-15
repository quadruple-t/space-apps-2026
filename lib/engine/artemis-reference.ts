/**
 * Artemis I (Orion EM-1) post-TLI reference path from JPL Horizons (id -1023), stored statically in
 * data/trajectory/artemis-1-reference.json by scripts/fetch-artemis-reference.ts. It is a SHAPE
 * comparison: the path is rotated so the Moon at the Artemis flyby lines up with our arrival Moon.
 */
import reference from "@/data/trajectory/artemis-1-reference.json"

export type ReferencePoint = { rKm: number; angleRad: number }

export type ArtemisReference = {
  points: ReferencePoint[]
  /** Hours from the first stored sample (just after TLI) to closest approach to the Moon */
  hoursToFlyby: number
  flybyAltitudeKm: number
  moonDistanceKm: number
}

const MOON_RADIUS_KM = 1737.4

/** Reference path (Earth-centred ecliptic projected to 2D) rotated onto `arrivalAngleRad`. */
export function artemisReference(arrivalAngleRad: number): ArtemisReference {
  const orion = reference.orionKm as number[][], moon = reference.moonKm as number[][]
  let best = 0, bestD = Infinity
  orion.forEach((p, i) => {
    const d = Math.hypot(p[0] - moon[i][0], p[1] - moon[i][1], p[2] - moon[i][2])
    if (d < bestD) { bestD = d; best = i }
  })
  const rotation = arrivalAngleRad - Math.atan2(moon[best][1], moon[best][0])
  return {
    points: orion.slice(0, best + 1).map((p) => ({ rKm: Math.hypot(p[0], p[1]), angleRad: Math.atan2(p[1], p[0]) + rotation })),
    hoursToFlyby: best * reference.stepHours,
    flybyAltitudeKm: bestD - MOON_RADIUS_KM,
    moonDistanceKm: Math.hypot(moon[best][0], moon[best][1]),
  }
}

export const ARTEMIS_REFERENCE_SOURCE = reference.source
export const ARTEMIS_REFERENCE_START_UTC = reference.startUtc
