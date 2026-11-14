/**
 * South-polar custom-coordinate grid (must match scripts/data-pipeline/31_terrain_grid.py).
 *
 * Cells are centred on multiples of the spacing in south polar stereographic metres
 * (sphere 1,737,400 m, x = ρ sin λ, y = ρ cos λ). Two regimes:
 *   g2: 2 km spacing, cells whose centre lies poleward of 84°S
 *   g5: 5 km spacing, cells whose centre lies between 84°S and 80°S
 * Tiles hold 16×16 cells; tile (ti, tj) covers global cells gx ∈ [16ti, 16ti+15], same for y.
 */
export const R_M = 1737400;
export const CELLS_PER_SIDE = 16;
const DEG = Math.PI / 180;

export const RHO_84 = 2 * R_M * Math.tan(3 * DEG); // ρ at 84°S
export const RHO_80 = 2 * R_M * Math.tan(5 * DEG); // ρ at 80°S

export interface GridRegime {
  id: "g2" | "g5";
  spacingM: number;
  contains(rhoM: number): boolean;
}

export const GRID_REGIMES: GridRegime[] = [
  { id: "g2", spacingM: 2000, contains: (r) => r <= RHO_84 },
  { id: "g5", spacingM: 5000, contains: (r) => r > RHO_84 && r <= RHO_80 },
];

export function llToStereo(latDeg: number, lonDeg: number): { x: number; y: number } {
  const rho = 2 * R_M * Math.tan(((90 + latDeg) * DEG) / 2);
  return { x: rho * Math.sin(lonDeg * DEG), y: rho * Math.cos(lonDeg * DEG) };
}

export function stereoToLl(x: number, y: number): { latDeg: number; lonDeg: number } {
  const rho = Math.hypot(x, y);
  return { latDeg: -90 + (2 * Math.atan(rho / (2 * R_M))) / DEG, lonDeg: Math.atan2(x, y) / DEG };
}

/** Stereographic point scale k = 2 / (1 + cos(colatitude)). */
export function scaleFactor(latDeg: number): number {
  return 2 / (1 + Math.cos((90 + latDeg) * DEG));
}

export function tileIdFor(regime: GridRegime["id"], ti: number, tj: number): string {
  return `${regime}_${ti}_${tj}`;
}

export interface GridSnap {
  tileId: string;
  cellIndex: number;
  /** ground distance from the input point to the cell centre */
  distanceKm: number;
  gridSpacingKm: number;
  cellCenter: { latDeg: number; lonDeg: number };
}

/**
 * Snap a coordinate to the nearest valid grid cell, or null outside 80–90°S.
 * Near 84°S both regimes are tried and the closer valid cell wins.
 */
export function snapToGrid(latDeg: number, lonDeg: number): GridSnap | null {
  if (!(latDeg <= -80) || latDeg < -90) return null;
  const { x, y } = llToStereo(latDeg, lonDeg);
  let best: GridSnap | null = null;
  let bestD = Infinity;
  for (const g of GRID_REGIMES) {
    const gx = Math.round(x / g.spacingM);
    const gy = Math.round(y / g.spacingM);
    const cx = gx * g.spacingM;
    const cy = gy * g.spacingM;
    if (!g.contains(Math.hypot(cx, cy))) continue;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestD) {
      bestD = d;
      const ti = Math.floor(gx / CELLS_PER_SIDE);
      const tj = Math.floor(gy / CELLS_PER_SIDE);
      const ix = gx - ti * CELLS_PER_SIDE;
      const iy = gy - tj * CELLS_PER_SIDE;
      const centre = stereoToLl(cx, cy);
      best = {
        tileId: tileIdFor(g.id, ti, tj),
        cellIndex: iy * CELLS_PER_SIDE + ix,
        distanceKm: d / scaleFactor(latDeg) / 1000,
        gridSpacingKm: g.spacingM / 1000,
        cellCenter: centre,
      };
    }
  }
  return best;
}
