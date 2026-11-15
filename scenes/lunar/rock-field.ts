/**
 * Decorative rock scatter for the surface drive's first-person view.
 *
 * Purely visual: rocks give the eye something to track while walking (parallax and small cast
 * shadows). They are never part of the DEM grid in lib/terrain/dem.ts, so line of sight, horizon,
 * sunlight and hardware analysis are unaffected. Placement is deterministic: each ground cell's rock
 * is derived from a hash of its integer cell index, so the same rocks appear at the same spots on
 * every frame and every reload, and only cells near the viewer are generated.
 */

export type RockFieldOptions = {
  /** Side of one scatter cell, metres. Each cell holds at most one rock. */
  cellM: number;
  /** Rocks are generated within this distance of the viewer, metres. */
  radiusM: number;
  /** Hard cap on rocks returned (nearest first). */
  maxRocks: number;
  /** Share of cells that hold a rock, 0..1. */
  density: number;
  /** Smallest angular size (radius / distance) worth drawing; tinier rocks are skipped. */
  minAngular: number;
  seed?: number;
};

export const ROCK_FIELD_HIGH: RockFieldOptions = { cellM: 1.6, radiusM: 70, maxRocks: 900, density: 0.42, minAngular: 0.0028 };
export const ROCK_FIELD_LOW: RockFieldOptions = { cellM: 2.2, radiusM: 45, maxRocks: 320, density: 0.36, minAngular: 0.004 };

/** Largest decorative boulder radius, metres. */
export const MAX_ROCK_RADIUS_M = 1.1;
export const ROCK_VARIANTS = 3;

export type Rock = {
  x: number;
  z: number;
  /** Horizontal radius, metres, already multiplied by `fade`. */
  radius: number;
  /** Height / width ratio: lunar boulders are partly buried and often flattish. */
  squash: number;
  /** Extra stretch along one horizontal axis. */
  stretch: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  variant: number;
  /** Grey level 0..1 (multiplies the white rock material). */
  shade: number;
  /** 0..1 scale-in near the outer edge and the size cut-off, so rocks grow in instead of popping. */
  fade: number;
};

/** Integer hash of a cell index to [0, 1). Stable across platforms (32-bit integer maths only). */
export function cellHash(i: number, j: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const rockRadius = (u: number) => Math.min(MAX_ROCK_RADIUS_M, 0.05 * Math.pow(1 - u * 0.996, -0.55));

/**
 * The rock (if any) that lives in cell (i, j), before distance culling. Sizes follow a steep power law:
 * mostly 5-20 cm pebbles, a few half-metre rocks, rare metre-scale boulders.
 */
export function rockInCell(i: number, j: number, cellM: number, density: number, seed = 0): Omit<Rock, "fade"> | null {
  const h = (k: number) => cellHash(i, j, seed * 16 + k);
  if (h(0) >= density) return null;
  const radius = rockRadius(h(1));
  return {
    x: (i + 0.1 + h(2) * 0.8) * cellM,
    z: (j + 0.1 + h(3) * 0.8) * cellM,
    radius,
    squash: 0.42 + h(4) * 0.4,
    stretch: 0.75 + h(5) * 0.6,
    yaw: h(6) * Math.PI * 2,
    tiltX: (h(7) - 0.5) * 0.5,
    tiltZ: (h(8) - 0.5) * 0.5,
    variant: Math.min(ROCK_VARIANTS - 1, Math.floor(h(9) * ROCK_VARIANTS)),
    // Neutral greys: most rocks a touch darker than the soil, some fresh bright ejecta.
    shade: 0.5 + h(10) * 0.32 + (h(11) > 0.9 ? 0.12 : 0),
  };
}

const offsetCache = new Map<number, Int32Array>();

/** Cell offsets (di, dj pairs) within `reach` cells, nearest first. Cached per reach. */
export function cellOffsets(reach: number): Int32Array {
  const cached = offsetCache.get(reach);
  if (cached) return cached;
  const list: Array<[number, number, number]> = [];
  for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
    const d2 = di * di + dj * dj;
    if (d2 <= (reach + 0.5) * (reach + 0.5)) list.push([di, dj, d2]);
  }
  list.sort((a, b) => a[2] - b[2]);
  const out = new Int32Array(list.length * 2);
  list.forEach(([di, dj], k) => { out[k * 2] = di; out[k * 2 + 1] = dj; });
  offsetCache.set(reach, out);
  return out;
}

/**
 * Rocks around (cx, cz), nearest first, at most `maxRocks`. `accept` can reject positions (outside
 * the tile, under placed hardware). Writes into `out` (reused between calls) and returns the count.
 */
export function scatterRocks(cx: number, cz: number, options: RockFieldOptions, out: Rock[], accept?: (x: number, z: number, radius: number) => boolean): number {
  const { cellM, radiusM, maxRocks, density, minAngular, seed = 0 } = options;
  const reach = Math.ceil(radiusM / cellM) + 1;
  const offsets = cellOffsets(reach);
  const ci = Math.floor(cx / cellM), cj = Math.floor(cz / cellM);
  const edge = radiusM * 0.2;
  let n = 0;
  for (let k = 0; k * 2 < offsets.length && n < maxRocks; k++) {
    const i = ci + offsets[k * 2], j = cj + offsets[k * 2 + 1];
    // Cheap pre-cull from two hashes: empty cells, and rocks too small to see from even the
    // nearest point of their cell, skip the full per-rock hashing.
    if (cellHash(i, j, seed * 16) >= density) continue;
    const nearest = Math.max(0.5, Math.hypot((i + 0.5) * cellM - cx, (j + 0.5) * cellM - cz) - cellM * 0.72);
    if (nearest >= radiusM || rockRadius(cellHash(i, j, seed * 16 + 1)) / nearest <= minAngular) continue;
    const rock = rockInCell(i, j, cellM, density, seed);
    if (!rock) continue;
    const d = Math.hypot(rock.x - cx, rock.z - cz);
    if (d >= radiusM) continue;
    // Grow in over the outer fifth of the radius and just above the angular cut-off.
    const angular = rock.radius / Math.max(d, 0.5);
    const fade = Math.min(1, (radiusM - d) / edge, (angular / minAngular - 1) * 2);
    if (!(fade > 0.02)) continue;
    if (accept && !accept(rock.x, rock.z, rock.radius)) continue;
    const slot = out[n] ?? (out[n] = { ...rock, fade });
    Object.assign(slot, rock);
    slot.fade = fade;
    slot.radius = rock.radius * fade;
    n++;
  }
  return n;
}
