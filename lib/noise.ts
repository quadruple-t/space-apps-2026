/**
 * Deterministic procedural helpers used by the illustrative terrain and
 * horizon graphics. Seeded so server and client output match exactly.
 */

/** Mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 2D value noise in [0, 1). */
export function valueNoise2D(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal Brownian motion, roughly in [-1, 1]. */
export function fbm2D(x: number, y: number, octaves = 5, seed = 0) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise2D(x * freq, y * freq, seed + i * 17) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** 1D periodic noise over [0, 1) — used for 360° horizon profiles. */
export function periodicNoise1D(t: number, period: number, seed = 0) {
  const x = t * period;
  const i = Math.floor(x);
  const f = smooth(x - i);
  const a = hash2(((i % period) + period) % period, 0, seed);
  const b = hash2((((i + 1) % period) + period) % period, 0, seed);
  return a + (b - a) * f;
}
