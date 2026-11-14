/**
 * Topocentric Sun/Earth direction from a lunar surface site (prompt §5.2,
 * validated against JPL Horizons quantity 4 to < 0.01°; see docs/METHODS.md).
 *
 * Frame: MOON_ME (DE421 mean Earth / polar axis), sphere R = 1737.4 km, east-positive longitude.
 * Azimuth 0 = north, clockwise; elevation is measured from the plane perpendicular to the
 * sphere normal (Horizons has no terrain; terrain comes from the horizon mask).
 */

export const MOON_RADIUS_KM = 1737.4;
const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];

export interface SiteFrame {
  up: Vec3;
  east: Vec3;
  north: Vec3;
  /** site position vector (km) from the Moon's centre */
  position: Vec3;
}

/** Build the local up/east/north frame for latitude φ, east longitude λ, height h (km above the sphere). */
export function siteFrame(latDeg: number, lonDeg: number, hKm = 0): SiteFrame {
  const p = latDeg * DEG;
  const l = lonDeg * DEG;
  const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
  const up: Vec3 = [cp * cl, cp * sl, sp];
  const r = MOON_RADIUS_KM + hKm;
  return {
    up,
    east: [-sl, cl, 0],
    north: [-sp * cl, -sp * sl, cp],
    position: [r * up[0], r * up[1], r * up[2]],
  };
}

/** Body position B = D·(cosβ cosL, cosβ sinL, sinβ) from its sub-point (β, L) and distance D (km). */
export function subPointToCartesian(latDeg: number, lonDeg: number, distKm: number): Vec3 {
  const b = latDeg * DEG;
  const L = lonDeg * DEG;
  const cb = Math.cos(b);
  return [distKm * cb * Math.cos(L), distKm * cb * Math.sin(L), distKm * Math.sin(b)];
}

export interface AzEl {
  azimuthDeg: number;
  elevationDeg: number;
}

/** az/el of a body at Moon-centred position B (km), seen from the site. Includes parallax. */
export function azElFromCartesian(frame: SiteFrame, body: Vec3): AzEl {
  const vx = body[0] - frame.position[0];
  const vy = body[1] - frame.position[1];
  const vz = body[2] - frame.position[2];
  const n = Math.hypot(vx, vy, vz);
  const vu = vx * frame.up[0] + vy * frame.up[1] + vz * frame.up[2];
  const ve = vx * frame.east[0] + vy * frame.east[1] + vz * frame.east[2];
  const vn = vx * frame.north[0] + vy * frame.north[1] + vz * frame.north[2];
  const el = Math.asin(Math.max(-1, Math.min(1, vu / n))) / DEG;
  let az = Math.atan2(ve, vn) / DEG;
  if (az < 0) az += 360;
  if (az >= 360) az -= 360;
  return { azimuthDeg: az, elevationDeg: el };
}

/** Convenience: az/el from a sub-point + distance. */
export function topocentricAzEl(
  siteLatDeg: number,
  siteLonDeg: number,
  subLatDeg: number,
  subLonDeg: number,
  distKm: number,
  hKm = 0,
): AzEl {
  return azElFromCartesian(siteFrame(siteLatDeg, siteLonDeg, hKm), subPointToCartesian(subLatDeg, subLonDeg, distKm));
}
