import { periodicNoise1D } from "./noise";

/**
 * Illustrative horizon-mask model.
 *
 * A horizon mask records, for every azimuth around a site, the highest
 * elevation angle at which terrain blocks the sky. Here it is generated from
 * periodic noise purely for explanatory graphics. In later phases this module
 * is the seam where LOLA-derived masks will be plugged in.
 */

export type HorizonSample = { azimuth: number; elevation: number };

export type HorizonModel = {
  mask: HorizonSample[];
  sunPath: HorizonSample[];
  earth: HorizonSample;
  maxElevation: number;
};

export function createIllustrativeHorizon(seed = 7, step = 2): HorizonModel {
  const mask: HorizonSample[] = [];
  const sunPath: HorizonSample[] = [];

  for (let az = 0; az <= 360; az += step) {
    const t = az / 360;
    // Broad massifs + mid ridges + fine crenellation, in degrees.
    const broad = periodicNoise1D(t, 5, seed) * 3.4;
    const mid = periodicNoise1D(t, 13, seed + 3) * 1.4;
    const fine = periodicNoise1D(t, 47, seed + 9) * 0.45;
    const elevation = Math.max(0.15, broad + mid + fine - 0.9);
    mask.push({ azimuth: az, elevation });

    // At the pole the Sun circles the horizon; its elevation wanders by ~±1.5°.
    const sunElevation = 1.45 + 1.25 * Math.sin(((az - 70) * Math.PI) / 180);
    sunPath.push({ azimuth: az, elevation: sunElevation });
  }

  const maxElevation = Math.max(...mask.map((s) => s.elevation), ...sunPath.map((s) => s.elevation));

  return {
    mask,
    sunPath,
    earth: { azimuth: 182, elevation: 4.1 },
    maxElevation,
  };
}

/** Elevation of the mask at an arbitrary azimuth (linear interpolation). */
export function maskElevationAt(mask: HorizonSample[], azimuth: number) {
  const az = ((azimuth % 360) + 360) % 360;
  for (let i = 0; i < mask.length - 1; i++) {
    const a = mask[i];
    const b = mask[i + 1];
    if (az >= a.azimuth && az <= b.azimuth) {
      const f = (az - a.azimuth) / (b.azimuth - a.azimuth || 1);
      return a.elevation + (b.elevation - a.elevation) * f;
    }
  }
  return mask[mask.length - 1].elevation;
}

/** Contiguous azimuth ranges where the Sun path clears the mask. */
export function sunlitRanges(model: HorizonModel) {
  const ranges: Array<[number, number]> = [];
  let start: number | null = null;
  model.sunPath.forEach((s, i) => {
    const lit = s.elevation > model.mask[i].elevation;
    if (lit && start === null) start = s.azimuth;
    if (!lit && start !== null) {
      ranges.push([start, s.azimuth]);
      start = null;
    }
  });
  if (start !== null) ranges.push([start, 360]);
  return ranges;
}
