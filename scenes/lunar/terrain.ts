import * as THREE from "three";
import { fbm2D, seededRandom, valueNoise2D } from "@/lib/noise";
import { HERO_SCENE } from "@/data/hero-scene";

/**
 * PROCEDURAL, ILLUSTRATIVE terrain — not LOLA-derived.
 *
 * Scene units are roughly 50 m. The camera looks down −Z. The mesh is a
 * frustum-shaped grid (narrow near the camera, wide at the horizon) so that
 * triangles keep a roughly constant on-screen size: dense where you can see
 * detail, coarse where you can't. Vertices are jittered so the low-poly
 * facets read as rock rather than as a regular grid.
 *
 * When real DEMs arrive, replace `heightAt` with a sampler over the dataset;
 * the mesh builder and scene do not need to change.
 */

const SEED = 1337;
const MOON_RADIUS_UNITS = 34_740; // 1737 km / 50 m

type Crater = { x: number; z: number; r: number; depth: number; rim: number; seed: number };
type Massif = { x: number; z: number; r: number; h: number; seed: number };
export type LunarTerrainProfile = {
  seed: number;
  regional: boolean;
  formation: "ridge" | "crater" | "peak" | "rim-and-ridge" | "massif";
  baseColor: string;
  shadowColor: string;
  highlightColor: string;
};

const REGION_PROFILES: Record<string, LunarTerrainProfile> = {
  "connecting-ridge": { seed: 101, regional: true, formation: "ridge", baseColor: "#9da0b8", shadowColor: "#45475f", highlightColor: "#d8d9e9" },
  "shackleton-rim": { seed: 204, regional: true, formation: "crater", baseColor: "#a795a8", shadowColor: "#514454", highlightColor: "#e2cce1" },
  "peak-near-shackleton": { seed: 307, regional: true, formation: "peak", baseColor: "#91a6b8", shadowColor: "#3f5061", highlightColor: "#d2e2eb" },
  "de-gerlache-rim": { seed: 411, regional: true, formation: "rim-and-ridge", baseColor: "#a69abb", shadowColor: "#514b69", highlightColor: "#e0d5f0" },
  "malapert-massif": { seed: 523, regional: true, formation: "massif", baseColor: "#b3a58e", shadowColor: "#534e45", highlightColor: "#e5d9bf" },
};

function hashCoordinates(latitudeDeg: number, longitudeDeg: number) {
  const source = `${latitudeDeg.toFixed(2)}:${longitudeDeg.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0) || 1;
}

/** A named destination gets its own landform; arbitrary map points are stable too. */
export function terrainProfileForSite(site?: { id?: string; latitudeDeg?: number; longitudeDeg?: number }): LunarTerrainProfile {
  const named = site?.id ? REGION_PROFILES[site.id] : undefined;
  if (named) return named;
  const seed = hashCoordinates(site?.latitudeDeg ?? 0, site?.longitudeDeg ?? 0);
  const variants: LunarTerrainProfile["formation"][] = ["ridge", "crater", "peak", "massif", "rim-and-ridge"];
  const palettes = [
    { baseColor: "#9da0b8", shadowColor: "#45475f", highlightColor: "#d8d9e9" },
    { baseColor: "#a795a8", shadowColor: "#514454", highlightColor: "#e2cce1" },
    { baseColor: "#91a6b8", shadowColor: "#3f5061", highlightColor: "#d2e2eb" },
    { baseColor: "#b3a58e", shadowColor: "#534e45", highlightColor: "#e5d9bf" },
    { baseColor: "#a69abb", shadowColor: "#514b69", highlightColor: "#e0d5f0" },
  ];
  const index = seed % variants.length;
  return { seed, regional: Boolean(site), formation: variants[index], ...palettes[index] };
}

/** The foreground crater the camera looks across — its floor stays in shadow. */
export const MAIN_CRATER: Crater = { x: -4, z: -112, r: 78, depth: 30, rim: 8, seed: 11 };

function polar(azimuthDeg: number, distance: number) {
  const a = (azimuthDeg * Math.PI) / 180;
  return { x: Math.sin(a) * distance, z: -Math.cos(a) * distance };
}

// Distant massifs placed by azimuth, leaving a notch where the Sun sits and
// a ridge for the Earth to hang above.
const MASSIFS: Massif[] = [
  { ...polar(-62, 600), r: 190, h: 64, seed: 1 },
  { ...polar(-41, 680), r: 120, h: 38, seed: 2 },
  { ...polar(-6, 640), r: 150, h: 46, seed: 3 },
  { ...polar(18, 560), r: 130, h: 34, seed: 4 },
  { ...polar(HERO_SCENE.earthAzimuthDeg + 2, 690), r: 210, h: 72, seed: 5 },
  { ...polar(58, 560), r: 170, h: 52, seed: 6 },
  { ...polar(-90, 420), r: 160, h: 40, seed: 7 },
  { ...polar(88, 430), r: 150, h: 44, seed: 8 },
];

const CRATERS: Crater[] = (() => {
  const rand = seededRandom(SEED);
  const list: Crater[] = [MAIN_CRATER];
  let guard = 0;
  while (list.length < 34 && guard++ < 400) {
    const z = -20 - rand() * 520;
    const spread = 70 + (-z) * 0.9;
    const x = (rand() * 2 - 1) * spread;
    const r = 4 + Math.pow(rand(), 2.2) * 34;
    // Keep the camera's standing ground clear.
    if (Math.hypot(x, z) < 40 + r) continue;
    list.push({ x, z, r, depth: r * (0.28 + rand() * 0.14), rim: r * (0.07 + rand() * 0.05), seed: guard });
  }
  return list;
})();

const smoothstep = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

function craterContribution(c: Crater, x: number, z: number) {
  const dx = x - c.x;
  const dz = z - c.z;
  const dist = Math.hypot(dx, dz);
  if (dist > c.r * 2.4) return 0;
  // Irregular rim: radius wobbles with angle.
  const angle = Math.atan2(dz, dx);
  const wobble = 1 + (valueNoise2D(Math.cos(angle) * 2.5 + c.seed, Math.sin(angle) * 2.5, c.seed) - 0.5) * 0.22;
  const d = dist / (c.r * wobble);
  if (d < 1) {
    // Bowl with a slightly flattened floor.
    const bowl = Math.pow(d, 2.2);
    return c.rim + (bowl - 1) * c.depth * (1 - 0.25 * smoothstep(0, 0.35, 0.35 - d));
  }
  const falloff = 1 - smoothstep(1, 2.3, d);
  return c.rim * falloff * falloff;
}

function massifContribution(m: Massif, x: number, z: number) {
  const dist = Math.hypot(x - m.x, z - m.z);
  if (dist > m.r) return 0;
  const shape = Math.pow(1 - smoothstep(0, 1, dist / m.r), 1.4);
  // Ridged detail so the skyline is crenellated rather than domed.
  const ridged = 1 - Math.abs(fbm2D(x / 55 + m.seed * 10, z / 55, 4, m.seed) );
  return m.h * shape * (0.65 + 0.55 * ridged);
}

const regionalCraterCache = new Map<number, Crater[]>();
const regionalMassifCache = new Map<number, Massif[]>();
function regionalCraters(seed: number) {
  const cached = regionalCraterCache.get(seed);
  if (cached) return cached;
  const rand = seededRandom(seed ^ 0x5f3759df);
  const craters: Crater[] = [];
  for (let index = 0; index < 11; index++) {
    const z = -65 - rand() * 690;
    const radius = 10 + Math.pow(rand(), 1.8) * 62;
    const x = (rand() * 2 - 1) * (100 + -z * 0.95);
    craters.push({ x, z, r: radius, depth: radius * (0.3 + rand() * 0.12), rim: radius * (0.08 + rand() * 0.06), seed: seed + index });
  }
  if (regionalCraterCache.size >= 96) {
    const oldestSeed = regionalCraterCache.keys().next().value;
    if (oldestSeed !== undefined) regionalCraterCache.delete(oldestSeed);
  }
  regionalCraterCache.set(seed, craters);
  return craters;
}

function regionalMassifs(seed: number) {
  const cached = regionalMassifCache.get(seed);
  if (cached) return cached;
  const rand = seededRandom(seed ^ 0x6d2b79f5);
  const massifs = Array.from({ length: 6 }, (_, index) => {
    const z = -220 - rand() * 570;
    const radius = 58 + rand() * 128;
    return { x: (rand() * 2 - 1) * (90 + -z * 0.9), z, r: radius, h: 16 + rand() * 28, seed: seed + index + 41 };
  });
  if (regionalMassifCache.size >= 96) {
    const oldestSeed = regionalMassifCache.keys().next().value;
    if (oldestSeed !== undefined) regionalMassifCache.delete(oldestSeed);
  }
  regionalMassifCache.set(seed, massifs);
  return massifs;
}

function landmarkContribution(profile: LunarTerrainProfile, x: number, z: number) {
  const offset = ((profile.seed % 9) - 4) * 2;
  const landmarkCrater: Crater = { x: offset, z: -135, r: 128, depth: 12, rim: 8, seed: profile.seed };
  const peak: Massif = { x: offset, z: -115, r: 84, h: 20, seed: profile.seed };
  const ridgeDistance = Math.abs(x - offset);
  const ridge = 12 * Math.exp(-((ridgeDistance / 22) ** 2)) * Math.exp(-(((z + 125) / 180) ** 4));

  switch (profile.formation) {
    case "ridge": return ridge + massifContribution({ ...peak, x: offset + 92, z: -210, r: 65, h: 10 }, x, z);
    case "crater": return craterContribution(landmarkCrater, x, z);
    case "peak": return massifContribution(peak, x, z) + massifContribution({ ...peak, x: offset - 58, z: -220, r: 52, h: 10, seed: profile.seed + 1 }, x, z);
    case "rim-and-ridge": return craterContribution({ ...landmarkCrater, x: offset + 80 }, x, z) + ridge * 0.72;
    case "massif": return massifContribution({ ...peak, h: 24, r: 160 }, x, z) + massifContribution({ ...peak, x: offset + 100, z: -230, h: 8, r: 90, seed: profile.seed + 2 }, x, z);
  }
}

/** Terrain height at world (x, z). Pure and deterministic for each region. */
export function heightAt(x: number, z: number, profile: LunarTerrainProfile = terrainProfileForSite()) {
  let h = fbm2D(x / 110, z / 110, 5, SEED + profile.seed) * 9;
  h += fbm2D(x / 22, z / 22, 3, SEED + profile.seed + 5) * 1.4;
  if (profile.regional) {
    for (const c of CRATERS) if (c !== MAIN_CRATER) h += craterContribution(c, x, z);
    for (const c of regionalCraters(profile.seed)) h += craterContribution(c, x, z);
    for (const m of regionalMassifs(profile.seed)) h += massifContribution(m, x, z);
  } else {
    for (const c of CRATERS) h += craterContribution(c, x, z);
    for (const m of MASSIFS) h += massifContribution(m, x, z);
  }
  h += landmarkContribution(profile, x, z);
  // Lunar curvature drops the far field below the camera's horizontal.
  h -= (x * x + z * z) / (2 * MOON_RADIUS_UNITS);
  return h;
}

export type TerrainDetail = "high" | "low";

const DETAIL = {
  high: { cols: 170, rows: 130 },
  low: { cols: 96, rows: 76 },
} as const;

const Z_NEAR = 34;
const Z_FAR = -820;
const BOUNDARY_DEPTH = 72;

/** Build the faceted terrain geometry. */
export function createTerrainGeometry(detail: TerrainDetail = "high", profile: LunarTerrainProfile = terrainProfileForSite()) {
  const { cols, rows } = DETAIL[detail];
  const rand = seededRandom(SEED + profile.seed + 99);

  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const colors = new Float32Array((cols + 1) * (rows + 1) * 3);
  const base = new THREE.Color(profile.baseColor);
  const dark = new THREE.Color(profile.shadowColor);
  const bright = new THREE.Color(profile.highlightColor);
  const tmp = new THREE.Color();

  let p = 0;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const vNext = (r + 1) / rows;
    const z = Z_NEAR - (Z_NEAR - Z_FAR) * Math.pow(v, 1.9);
    const zNext = Z_NEAR - (Z_NEAR - Z_FAR) * Math.pow(vNext, 1.9);
    const cellD = Math.abs(zNext - z);
    const halfW = 70 + (Z_NEAR - z) * 1.3;
    const cellW = (2 * halfW) / cols;

    for (let c = 0; c <= cols; c++) {
      const edge = r === 0 || r === rows || c === 0 || c === cols;
      let x = -halfW + c * cellW;
      let zz = z;
      if (!edge) {
        x += (rand() - 0.5) * cellW * 0.72;
        zz += (rand() - 0.5) * cellD * 0.72;
      }
      const y = heightAt(x, zz, profile);
      positions[p] = x;
      positions[p + 1] = y;
      positions[p + 2] = zz;

      // Albedo: subtle mottling, brighter ejecta near crater rims.
      const mottle = valueNoise2D(x / 9, zz / 9, profile.seed + 3) * 0.6 + valueNoise2D(x / 40, zz / 40, profile.seed + 4) * 0.4;
      tmp.copy(dark).lerp(base, mottle);
      if (!profile.regional) {
        const rimDist = Math.abs(Math.hypot(x - MAIN_CRATER.x, zz - MAIN_CRATER.z) / MAIN_CRATER.r - 1.12);
        if (rimDist < 0.3) tmp.lerp(bright, (0.3 - rimDist) * 1.1);
      }
      colors[p] = tmp.r;
      colors[p + 1] = tmp.g;
      colors[p + 2] = tmp.b;
      p += 3;
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + (cols + 1);
      const e = d + 1;
      // Counter-clockwise from above (+Y normals). Randomise the diagonal
      // to avoid a visible weave.
      if (rand() > 0.5) indices.push(a, b, d, b, e, d);
      else indices.push(a, b, e, a, e, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Vertical faces and a top line that make the procedural map edge unmistakable. */
export function createTerrainBoundaryGeometry(detail: TerrainDetail = "high", profile: LunarTerrainProfile = terrainProfileForSite()) {
  const { cols, rows } = DETAIL[detail];
  const perimeter: Array<{ x: number; z: number }> = [];
  const rowAt = (row: number) => {
    const v = row / rows;
    const z = Z_NEAR - (Z_NEAR - Z_FAR) * Math.pow(v, 1.9);
    return { z, halfW: 70 + (Z_NEAR - z) * 1.3 };
  };

  for (let row = 0; row <= rows; row++) {
    const { z, halfW } = rowAt(row);
    perimeter.push({ x: -halfW, z });
  }
  const far = rowAt(rows);
  for (let col = 1; col <= cols; col++) perimeter.push({ x: -far.halfW + (2 * far.halfW * col) / cols, z: Z_FAR });
  for (let row = rows - 1; row >= 0; row--) {
    const { z, halfW } = rowAt(row);
    perimeter.push({ x: halfW, z });
  }
  const near = rowAt(0);
  for (let col = cols - 1; col > 0; col--) perimeter.push({ x: -near.halfW + (2 * near.halfW * col) / cols, z: Z_NEAR });

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const upper = new THREE.Color("#756b7d");
  const lower = new THREE.Color("#393447");
  const edgePoints = perimeter.map(({ x, z }) => new THREE.Vector3(x, heightAt(x, z, profile) + 0.4, z));

  for (let index = 0; index < perimeter.length; index++) {
    const a = perimeter[index];
    const b = perimeter[(index + 1) % perimeter.length];
    const topA = heightAt(a.x, a.z, profile);
    const topB = heightAt(b.x, b.z, profile);
    const baseIndex = positions.length / 3;
    positions.push(
      a.x, topA, a.z,
      b.x, topB, b.z,
      a.x, topA - BOUNDARY_DEPTH, a.z,
      b.x, topB - BOUNDARY_DEPTH, b.z,
    );
    const block = index % 2 === 0 ? upper : lower;
    for (let vertex = 0; vertex < 4; vertex++) {
      const shade = vertex < 2 ? block : lower;
      colors.push(shade.r, shade.g, shade.b);
    }
    indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 1, baseIndex + 2, baseIndex + 3);
  }

  const wall = new THREE.BufferGeometry();
  wall.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  wall.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  wall.setIndex(indices);
  wall.computeVertexNormals();
  wall.computeBoundingBox();

  const edge = new THREE.BufferGeometry().setFromPoints(edgePoints);
  return { wall, edge };
}
