/**
 * Geometry for the top-down orbit diagram. Pure functions, no rendering.
 *
 * Input is the Moon-centred Sun and Earth positions from lib/ephemeris (MOON_ME frame, km).
 * The diagram frame puts the Sun on +x and looks down from the Moon's north pole (within
 * 1.5° of ecliptic north): x̂ = Sun direction, ŷ = ẑ × x̂.
 */

import type { Vec3 } from "@/lib/ephemeris"

const DEG = Math.PI / 180

export type OrbitGeometry = {
  /** Moon position relative to Earth in the diagram plane (km) */
  moon: { x: number; y: number }
  /** Site's surface direction projected onto the Moon's disk as seen from above (unit circle) */
  site: { x: number; y: number }
  /** true when the site is on the hemisphere facing away from the viewer (south of the Moon's equator) */
  siteOnFarSide: boolean
  earthDistanceKm: number
}

export function orbitGeometry(sun: Vec3, earth: Vec3, siteLatDeg: number, siteLonDeg: number): OrbitGeometry {
  const sl = Math.hypot(sun[0], sun[1], sun[2])
  const x: Vec3 = [sun[0] / sl, sun[1] / sl, sun[2] / sl]
  // ŷ = ẑ × x̂, normalised
  const yRaw: Vec3 = [-x[1], x[0], 0]
  const yl = Math.hypot(yRaw[0], yRaw[1]) || 1
  const y: Vec3 = [yRaw[0] / yl, yRaw[1] / yl, 0]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

  const moonFromEarth: Vec3 = [-earth[0], -earth[1], -earth[2]]
  const la = siteLatDeg * DEG, lo = siteLonDeg * DEG
  const p: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  return {
    moon: { x: dot(moonFromEarth, x), y: dot(moonFromEarth, y) },
    site: { x: dot(p, x), y: dot(p, y) },
    siteOnFarSide: p[2] < 0,
    earthDistanceKm: Math.hypot(earth[0], earth[1], earth[2]),
  }
}

/** Sun–Earth–Moon phase from the Moon's position in the Sun frame (Sun at +x). */
export function phase(moonInSunFrame: { x: number; y: number }) {
  const elong = Math.atan2(moonInSunFrame.y, moonInSunFrame.x) // Moon's angle from the Sun direction, seen from Earth
  const phaseAngle = Math.PI - Math.abs(elong)
  const illuminated = (1 + Math.cos(phaseAngle)) / 2
  const deg = Math.abs(elong) / DEG
  const waxing = elong > 0 // counter-clockwise from new (0°) through first quarter (+90°) to full (180°)
  const name = deg < 10 ? "New Moon" : deg > 170 ? "Full Moon" : deg < 80 ? (waxing ? "Waxing crescent" : "Waning crescent")
    : deg < 100 ? (waxing ? "First quarter" : "Last quarter") : (waxing ? "Waxing gibbous" : "Waning gibbous")
  return { phaseAngleDeg: phaseAngle / DEG, illuminated, name }
}
