/**
 * Geometry for the top-down orbit diagram. Pure functions, no rendering.
 * Frame: ecliptic plane seen from ecliptic north, rotated so the Sun lies on +x.
 */

import type { VectorEntry } from "./horizons"

export type Vec3 = { x: number; y: number; z: number }

/** Linear interpolation of a time series of vectors at tMs (clamped to the ends). */
export function vectorAt(series: VectorEntry[], tMs: number): Vec3 | null {
  if (!series.length) return null
  const t0 = Date.parse(series[0].time)
  const dt = series.length > 1 ? Date.parse(series[1].time) - t0 : 1
  const f = Math.max(0, Math.min(series.length - 1, (tMs - t0) / dt))
  const i = Math.min(series.length - 2, Math.floor(f))
  if (i < 0) return series[0]
  const a = series[i], b = series[i + 1], u = f - i
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }
}

/** Rotate a geocentric ecliptic vector into the frame where the Sun is on +x. */
export function toSunFrame(v: Vec3, sun: Vec3): { x: number; y: number } {
  const a = -Math.atan2(sun.y, sun.x)
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }
}

/**
 * Direction (radians, counter-clockwise from +x in the Sun frame) of a surface site
 * on the Moon as seen from above. The Moon is tidally locked: 0° E faces Earth, and
 * east longitude increases counter-clockwise viewed from the north. Libration ignored.
 */
export function siteAngle(moonInSunFrame: { x: number; y: number }, lonDeg: number): number {
  const towardEarth = Math.atan2(-moonInSunFrame.y, -moonInSunFrame.x)
  return towardEarth + (lonDeg * Math.PI) / 180
}

/** Sun–Earth–Moon angle as seen from the Moon (0 = full, 180 = new) and illuminated fraction. */
export function phase(moonInSunFrame: { x: number; y: number }) {
  // Sun is effectively at +x infinity; phase angle is the angle at the Moon between Sun and Earth.
  const elong = Math.atan2(moonInSunFrame.y, moonInSunFrame.x) // Moon's angle from the Sun direction, seen from Earth
  const phaseAngle = Math.PI - Math.abs(elong)
  const illuminated = (1 + Math.cos(phaseAngle)) / 2
  const deg = Math.abs(elong) * 180 / Math.PI
  const waxing = elong > 0 // counter-clockwise from new (0°) through first quarter (+90°) to full (180°)
  const name = deg < 10 ? "New Moon" : deg > 170 ? "Full Moon" : deg < 80 ? (waxing ? "Waxing crescent" : "Waning crescent")
    : deg < 100 ? (waxing ? "First quarter" : "Last quarter") : (waxing ? "Waxing gibbous" : "Waning gibbous")
  return { phaseAngleDeg: (phaseAngle * 180) / Math.PI, illuminated, name }
}
