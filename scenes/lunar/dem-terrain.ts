import * as THREE from "three";
import { discVisibleFraction, MOON_RADIUS_M, sampleField, slopeAtLocal, SUN_RADIUS_DEG, tangentPlaneHeight, type DemGrid } from "@/lib/terrain/dem";

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
  const worldY = new Float32Array(size * size);
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    const y = tangentPlaneHeight(-half + i * spacing, half - j * spacing, grid.heightsM[k], exaggeration);
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
const REGOLITH_DARK = new THREE.Color("#5d5b66");
const REGOLITH_LIGHT = new THREE.Color("#b9b6c2");

function rampColor(t: number, out: THREE.Color) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
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
      const slope = slopeAtLocal(grid, east, north);
      if (mode === "slope") tmp.copy(SLOPE_STEPS.find(([limit]) => slope < limit)![1]);
      else {
        // Steeper slopes expose fresher, brighter material; flats stay mature and dark.
        tmp.copy(REGOLITH_DARK).lerp(REGOLITH_LIGHT, 0.45 + Math.min(0.45, slope / 40) + (((i * 7919 + j * 104729) % 97) / 97 - 0.5) * 0.06);
      }
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
