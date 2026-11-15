import * as THREE from "three";
import { valueNoise2D } from "@/lib/noise";
import { discVisibleFraction, heightAtLocal, MOON_RADIUS_M, sampleField, slopeAtLocal, SUN_RADIUS_DEG, tangentPlaneHeight, type DemGrid } from "@/lib/terrain/dem";

/**
 * Measured-elevation terrain for the surface drive (see lib/terrain/dem.ts for the grid).
 *
 * Scene units are metres. +X is east, -Z is north, +Y is up at the site; the grid's heights are
 * placed relative to the site's tangent plane, so lunar curvature is real (about 29 m of drop
 * 10 km out, 72 km at 500 km). `exaggeration` scales relief only, never curvature.
 */

export type TerrainColorMode = "regolith" | "elevation" | "slope";

export type DemSurface = {
  grid: DemGrid;
  exaggeration: number;
  size: number;
  spacing: number;
  half: number;
  /** Displayed Y of each grid sample (tangent-plane frame, metres). */
  worldY: Float32Array;
  minY: number;
  maxY: number;
};

export function buildDemSurface(grid: DemGrid, exaggeration = 1): DemSurface {
  const { size, spacingM: spacing, halfExtentM: half } = grid;
  const display = grid.heightsM;
  const worldY = new Float32Array(size * size);
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    const y = tangentPlaneHeight(-half + i * spacing, half - j * spacing, display[k], exaggeration);
    worldY[k] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { grid, exaggeration, size, spacing, half, worldY, minY, maxY };
}

const cellOf = (s: DemSurface, x: number, z: number) => {
  const gi = Math.max(0, Math.min(s.size - 1 - 1e-6, (x + s.half) / s.spacing));
  const gj = Math.max(0, Math.min(s.size - 1 - 1e-6, (z + s.half) / s.spacing));
  const i = Math.floor(gi), j = Math.floor(gj);
  return { i, j, fx: gi - i, fy: gj - j };
};

/** Ground Y on the rendered triangles (same diagonal split as the mesh), so objects sit flush. */
export function groundY(s: DemSurface, x: number, z: number): number {
  const { i, j, fx, fy } = cellOf(s, x, z);
  const k = j * s.size + i;
  const a = s.worldY[k], b = s.worldY[k + 1], d = s.worldY[k + s.size], e = s.worldY[k + s.size + 1];
  return fx + fy <= 1 ? a + (b - a) * fx + (d - a) * fy : e + (d - e) * (1 - fx) + (b - e) * (1 - fy);
}

/** Upward surface normal of the rendered triangle under (x, z). */
export function groundNormal(s: DemSurface, x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const { i, j, fx, fy } = cellOf(s, x, z);
  const k = j * s.size + i;
  const a = s.worldY[k], b = s.worldY[k + 1], d = s.worldY[k + s.size], e = s.worldY[k + s.size + 1];
  const [dydx, dydz] = fx + fy <= 1 ? [b - a, d - a] : [e - d, e - b];
  return out.set(-dydx / s.spacing, 1, -dydz / s.spacing).normalize();
}

export const insideTile = (s: DemSurface, x: number, z: number, margin = 0) => Math.abs(x) <= s.half - margin && Math.abs(z) <= s.half - margin;

/** Local east/north (m) from scene x/z. */
export const toLocal = (x: number, z: number) => ({ eastM: x, northM: -z });

const RAMP = ["#7a3cff", "#2f6bff", "#22c7c7", "#4fd65a", "#f2e93a", "#f2902a", "#e02424"].map((c) => new THREE.Color(c));
const SLOPE_STEPS: Array<[number, THREE.Color]> = [[5, new THREE.Color("#7fa58a")], [10, new THREE.Color("#c9c36a")], [15, new THREE.Color("#e39a4f")], [90, new THREE.Color("#ff5364")]];
// Lunar regolith is a neutral, high-contrast grey: dark basaltic mare, brighter
// feldspathic highlands, and bright freshly exposed material on steep slopes and crater rims.
// No hue at all, and the dark end is lifted off black so walking over mare still shows texture.
const REGOLITH_STOPS = ["#3c3c3c", "#696969", "#979797", "#bebebe", "#e2e2e2"].map((c) => new THREE.Color(c));

function rampColor(t: number, out: THREE.Color) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
}

/**
 * Stylised regolith colouring, not measured albedo. Brightness comes from the terrain itself:
 * elevation (low ground reads as dark mare, high ground as highland), slope and convexity (fresh,
 * bright material on steep faces and crater rims; mature dark soil in hollows), plus mottling at
 * several scales so large flats are not one flat grey. Strictly neutral (R = G = B).
 */
function regolithColor(s: DemSurface, i: number, j: number, out: THREE.Color) {
  const { grid, size, spacing, half } = s;
  const k = j * size + i;
  const east = -half + i * spacing, north = half - j * spacing;
  const h = grid.heightsM[k];
  // Slope and convexity are taken over about one source posting (~100 m). Over a single grid step they
  // would trace the seams left by interpolating the ~100 m data onto a finer mesh.
  const reach = Math.max(spacing, 100);
  const hAt = (e: number, n: number) => heightAtLocal(grid, e, n);
  const east1 = hAt(east + reach, north), west1 = hAt(east - reach, north), north1 = hAt(east, north + reach), south1 = hAt(east, north - reach);
  const slopeDeg = (Math.atan(Math.hypot((east1 - west1) / (2 * reach), (north1 - south1) / (2 * reach))) * 180) / Math.PI;
  // Positive on ridges and rims, negative in hollows.
  const convexity = h - (east1 + west1 + north1 + south1) / 4;
  const rim = Math.max(-1, Math.min(1, convexity / (reach * 0.05)));
  // World-metre noise so the pattern keeps the same size whatever the tile radius.
  const broad = valueNoise2D(east / 900 + 11.3, north / 900 + 4.7, 3);
  const patch = valueNoise2D(east / 220 + 2.1, north / 220 + 9.4, 5);
  const grainScale = Math.max(45, spacing * 3);
  const grain = valueNoise2D(east / grainScale + 7.7, north / grainScale + 1.3, 8);
  const highland = Math.max(-0.5, Math.min(0.5, (h + 1500) / 4000));
  let t = 0.42 + highland * 0.4 + (broad - 0.5) * 0.3 + (patch - 0.5) * 0.28 + (grain - 0.5) * 0.16;
  t += Math.min(0.4, slopeDeg / 28) + rim * 0.2;
  t = Math.max(0, Math.min(1, t));
  const x = t * (REGOLITH_STOPS.length - 1), n = Math.min(REGOLITH_STOPS.length - 2, Math.floor(x));
  out.copy(REGOLITH_STOPS[n]).lerp(REGOLITH_STOPS[n + 1], x - n);
}

export function fillColors(s: DemSurface, mode: TerrainColorMode, colors: Float32Array) {
  const { grid, size, spacing, half } = s;
  const tmp = new THREE.Color();
  const range = Math.max(1, grid.maxM - grid.minM);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    const east = -half + i * spacing, north = half - j * spacing;
    if (mode === "elevation") rampColor((grid.heightsM[k] - grid.minM) / range, tmp);
    else {
      if (mode === "slope") {
        const slope = slopeAtLocal(grid, east, north);
        tmp.copy(SLOPE_STEPS.find(([limit]) => slope < limit)![1]);
      } else regolithColor(s, i, j, tmp);
    }
    colors.set([tmp.r, tmp.g, tmp.b], k * 3);
  }
}

export function createDemGeometry(s: DemSurface, mode: TerrainColorMode) {
  const { size, spacing, half, worldY } = s;
  const positions = new Float32Array(size * size * 3);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    positions.set([-half + i * spacing, worldY[k], -half + j * spacing], k * 3);
  }
  const colors = new Float32Array(size * size * 3);
  fillColors(s, mode, colors);
  const sunVis = new Float32Array(size * size).fill(1);
  const index = new (size * size > 65535 ? Uint32Array : Uint16Array)((size - 1) * (size - 1) * 6);
  let p = 0;
  for (let j = 0; j < size - 1; j++) for (let i = 0; i < size - 1; i++) {
    const a = j * size + i, b = a + 1, d = a + size, e = d + 1;
    index.set([a, d, b, b, d, e], p);
    p += 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("sunVis", new THREE.BufferAttribute(sunVis, 1));
  const uv = new Float32Array(size * size * 2);
  for (let k = 0; k < size * size; k++) { uv[k * 2] = positions[k * 3] / 12; uv[k * 2 + 1] = positions[k * 3 + 2] / 12; }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Fraction of the solar disc visible from each grid sample, from a ray march toward the Sun over
 * the displayed terrain (curvature included). Only terrain inside the tile can block the Sun, so
 * near the edge the result is an upper bound. Evaluated every `stride` samples and interpolated.
 */
export function computeSunVisibility(s: DemSurface, sun: THREE.Vector3, out: Float32Array, stride = 2) {
  const { size, spacing, half, worldY, maxY } = s;
  const horizontal = Math.hypot(sun.x, sun.z);
  const elevation = Math.atan2(sun.y, horizontal);
  const hx = horizontal > 1e-9 ? sun.x / horizontal : 0, hz = horizontal > 1e-9 ? sun.z / horizontal : 0;
  const tanTop = Math.tan(Math.min(Math.PI / 2 - 1e-6, elevation + (SUN_RADIUS_DEG * Math.PI) / 180));
  const elevationDeg = (elevation * 180) / Math.PI;
  const coarse = Math.floor((size - 1) / stride) + 1;
  const values = new Float32Array(coarse * coarse);
  const baseStep = spacing * stride * 0.75;
  for (let cj = 0; cj < coarse; cj++) for (let ci = 0; ci < coarse; ci++) {
    const i = Math.min(size - 1, ci * stride), j = Math.min(size - 1, cj * stride);
    const x0 = -half + i * spacing, z0 = -half + j * spacing, y0 = worldY[j * size + i] + 0.5;
    // Below the smooth-sphere horizon at this point: the Moon itself blocks the Sun.
    const ux = x0, uy = y0 + MOON_RADIUS_M, uz = z0;
    const localElevationDeg = (Math.asin((sun.x * ux + sun.y * uy + sun.z * uz) / Math.hypot(ux, uy, uz)) * 180) / Math.PI;
    let vis = discVisibleFraction(localElevationDeg, 0);
    if (vis > 0 && horizontal > 1e-9) {
      let best = -Infinity;
      for (let d = baseStep; ; d += Math.max(baseStep, d * 0.015)) {
        const x = x0 + hx * d, z = z0 + hz * d;
        if (x < -half || x > half || z < -half || z > half) break;
        if (y0 + d * tanTop > maxY) break;
        const t = Math.atan2(sampleField(worldY, size, (x + half) / spacing, (z + half) / spacing) - y0, d);
        if (t > best) best = t;
      }
      if (best > -Infinity) vis = Math.min(vis, discVisibleFraction(elevationDeg, (best * 180) / Math.PI));
    }
    values[cj * coarse + ci] = vis;
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    out[j * size + i] = sampleField(values, coarse, i / stride, j / stride);
  }
}

/**
 * Patch a standard material so direct (sun) light is scaled by a per-vertex `sunVis` attribute
 * (terrain) or a per-material uniform (objects). Earthshine and ambient light are unaffected.
 */
export function patchSunVisibility(material: THREE.Material, source: "attribute" | { value: number }) {
  material.onBeforeCompile = (shader) => {
    if (source === "attribute") {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float sunVis;\nvarying float vSunVis;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSunVis = sunVis;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vSunVis;");
    } else {
      shader.uniforms.uSunVis = source;
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uSunVis;\n#define vSunVis uSunVis");
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      "reflectedLight.directDiffuse *= vSunVis;\nreflectedLight.directSpecular *= vSunVis;\n#include <lights_fragment_end>",
    );
  };
  material.customProgramCacheKey = () => `sunvis-${source === "attribute" ? "a" : "u"}`;
  material.needsUpdate = true;
}

/** Cosmetic 12 m repeating grain/pebbles: provides motion cues without changing measured heights. */
export function createRegolithDetailTexture() {
  const side = 256, pixels = new Uint8Array(side * side * 4);
  let seed = 7319;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const grain = random();
    // Kept near white so the map adds grain without darkening the vertex colours.
    const shade = Math.round(200 + grain * 50 + 5 * Math.sin(x * 0.15 + Math.sin(y * 0.12)));
    const k = (y * side + x) * 4;
    pixels[k] = pixels[k + 1] = pixels[k + 2] = shade; pixels[k + 3] = 255;
  }
  for (let pebble = 0; pebble < 150; pebble++) {
    const cx = Math.floor(random() * side), cy = Math.floor(random() * side), radius = 1 + Math.floor(random() * 3);
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y > radius * radius) continue;
      const k = (((cy + y + side) % side) * side + (cx + x + side) % side) * 4;
      pixels[k] = pixels[k + 1] = pixels[k + 2] = x + y > 0 ? 150 : 250;
    }
  }
  const texture = new THREE.DataTexture(pixels, side, side);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/** Metres covered by one repeat of the regolith normal map (terrain UVs are metres / 12). */
export const REGOLITH_NORMAL_SPAN_M = 24;

/**
 * Cosmetic micro-relief as a tangent-space normal map: tileable fine undulation, small craterlets
 * (0.3-2.4 m, bowl plus raised rim) and pebble bumps over a 24 m repeat. It only changes shading, so
 * the measured heights, horizon and sunlight analysis are untouched, but near-field ground now shows
 * relief that slides past as the viewer moves. `side` 512 ≈ 4.7 cm per texel, 256 ≈ 9.4 cm.
 */
export function createRegolithNormalTexture(side = 512) {
  const texelM = REGOLITH_NORMAL_SPAN_M / side;
  const height = new Float32Array(side * side);
  const wrap = (v: number) => ((v % side) + side) % side;
  // Tileable value noise: a lattice of `period` x `period` random values that wraps, so the texture
  // repeats seamlessly. Periods across the 24 m tile give features of ~3 m, 1.5 m, 0.75 m and 0.375 m.
  let seed = 90127;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (const [period, amp] of [[8, 0.07], [16, 0.035], [32, 0.016], [64, 0.008]] as const) {
    const lattice = Float32Array.from({ length: period * period }, () => random() - 0.5);
    const cell = side / period;
    for (let y = 0; y < side; y++) {
      const fy = y / cell, j = Math.floor(fy), v = smooth(fy - j), j0 = j * period, j1 = ((j + 1) % period) * period;
      for (let x = 0; x < side; x++) {
        const fx = x / cell, i = Math.floor(fx), u = smooth(fx - i), i1 = (i + 1) % period;
        const p = lattice[j0 + i], q = lattice[j0 + i1], r = lattice[j1 + i], t = lattice[j1 + i1];
        height[y * side + x] += amp * (p + (q - p) * u + (r - p) * v + (p - q - r + t) * u * v);
      }
    }
  }
  // Craterlets: bowl depressions with a raised rim, continuous at the rim crest.
  for (let c = 0; c < 46; c++) {
    const cx = random() * side, cy = random() * side;
    const rM = 0.3 + Math.pow(random(), 2.2) * 2.1, r = rM / texelM;
    const depth = rM * (0.12 + random() * 0.08), rim = rM * 0.04;
    const reach = Math.ceil(r * 1.6);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx + 0.5 - (cx % 1), dy + 0.5 - (cy % 1)) / r;
      if (d >= 1.6) continue;
      const delta = d < 1 ? depth * (d * d - 1) + rim : rim * (1 - (d - 1) / 0.6) ** 2;
      height[wrap(Math.floor(cy) + dy) * side + wrap(Math.floor(cx) + dx)] += delta;
    }
  }
  // Pebbles: small domes, 4-15 cm across.
  for (let p = 0; p < side * 1.2; p++) {
    const cx = Math.floor(random() * side), cy = Math.floor(random() * side);
    const r = Math.max(1, (0.02 + random() * 0.055) / texelM), top = r * texelM * 0.6;
    const reach = Math.ceil(r);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 < 1) height[wrap(cy + dy) * side + wrap(cx + dx)] += top * Math.sqrt(1 - d2);
    }
  }
  const pixels = new Uint8Array(side * side * 4);
  const n = new THREE.Vector3();
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = (height[y * side + wrap(x + 1)] - height[y * side + wrap(x - 1)]) / (2 * texelM);
    const sy = (height[wrap(y + 1) * side + x] - height[wrap(y - 1) * side + x]) / (2 * texelM);
    n.set(-sx, -sy, 1).normalize();
    const k = (y * side + x) * 4;
    pixels[k] = Math.round((n.x * 0.5 + 0.5) * 255);
    pixels[k + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
    pixels[k + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
    pixels[k + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, side, side);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12 / REGOLITH_NORMAL_SPAN_M, 12 / REGOLITH_NORMAL_SPAN_M);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
