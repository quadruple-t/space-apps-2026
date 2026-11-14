import type { HorizonMask, TerrainGridTile } from "@/lib/model/types";

/**
 * Mask elevation (deg) at an arbitrary azimuth, linear interpolation with wrap-around
 * (bin i is centred on azimuth i·binDeg; the bin after the last wraps to bin 0).
 */
export function maskAt(mask: ArrayLike<number>, binDeg: number, azimuthDeg: number): number {
  const n = mask.length;
  if (n === 0) return 0;
  if (Math.abs(n * binDeg - 360) > 1e-6) throw new Error(`mask has ${n} bins of ${binDeg}°, which does not cover 360°`);
  const az = ((azimuthDeg % 360) + 360) % 360;
  const x = az / binDeg;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  return mask[i0] + (mask[i1] - mask[i0]) * f;
}

/** True when a body at (az, el) clears the terrain mask. */
export function isAboveMask(mask: HorizonMask, azimuthDeg: number, elevationDeg: number): boolean {
  return elevationDeg > maskAt(mask.maskElevationDeg, mask.binDeg, azimuthDeg);
}

export const SMOOTH_HORIZON_LABEL = "none — smooth horizon";

/** Outside the polar grid with no site mask: a smooth-sphere horizon. The UI must flag it. */
export function smoothHorizonMask(binDeg = 1): HorizonMask {
  const bins = Math.round(360 / binDeg);
  return {
    source: "none",
    binDeg,
    maskElevationDeg: new Float32Array(bins),
    maskP05Deg: null,
    maskP95Deg: null,
    errorMarginDeg: 0,
    maskSigmaDeg: null,
    demProducts: [],
    rayLengthKm: 0,
    observerHeightM: 0,
  };
}

export const GRID_NO_DATA = -32768;

/** Mask for one grid cell (centidegrees → degrees). Returns null when the cell has no data. */
export function maskFromGridCell(tile: TerrainGridTile, cellIndex: number): HorizonMask | null {
  const { bins } = tile;
  if (cellIndex < 0 || cellIndex >= tile.cellsPerSide * tile.cellsPerSide) throw new RangeError("cellIndex out of range");
  const off = cellIndex * bins;
  const el = new Float32Array(bins);
  const sigma = new Float32Array(bins);
  let maxSigma = 0;
  for (let i = 0; i < bins; i++) {
    const v = tile.masks[off + i];
    if (v === GRID_NO_DATA) return null;
    el[i] = v / 100;
    sigma[i] = tile.maskErr[off + i] * 0.05;
    if (sigma[i] > maxSigma) maxSigma = sigma[i];
  }
  return {
    source: "LOLA DEM grid",
    binDeg: tile.binDeg,
    maskElevationDeg: el,
    maskP05Deg: null,
    maskP95Deg: null,
    errorMarginDeg: Math.round(2 * percentile(sigma, 0.95) * 1000) / 1000,
    maskSigmaDeg: sigma,
    demProducts: tile.demProducts,
    rayLengthKm: tile.rayLengthKm,
    observerHeightM: tile.observerHeightM,
  };
}

function percentile(a: Float32Array, q: number): number {
  const s = Array.from(a).sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] ?? 0;
}
