import { windowsFrom, type VisibilityWindow } from "./visibility-windows";
export { windowsFrom } from "./visibility-windows";
import { type Sample, SOLAR_CONSTANT_W_M2 } from "@/lib/illumination";
import { OBSERVER_HEIGHT_M, SOLAR_ARRAY_AREA_M2, SOLAR_ARRAY_EFFICIENCY, type Placement } from "@/lib/drive-placements";
import { discVisibleFraction, EARTH_RADIUS_DEG, horizonProfile, skyAtLocal, type DemGrid } from "@/lib/terrain/dem";
import { maskAt } from "@/lib/terrain/mask";

/**
 * Generation and communication windows for the hardware a user placed in the surface drive.
 * Each object sees the site's Sun and Earth positions re-expressed in its own horizon frame (the Moon's
 * curvature tilts the local vertical away from the site centre), tested against the terrain inside the
 * loaded elevation grid at the height of the panel or dish. Terrain outside the grid is not seen, so
 * results are upper bounds near its edge. Objects outside the grid are skipped and listed in
 * `outside` rather than reported as having a clear horizon.
 */

const BIN_DEG = 3;

/** Whether a point is inside the loaded elevation grid; outside it no terrain is tested at all. */
export const insideGrid = (grid: DemGrid, eastM: number, northM: number) => Math.abs(eastM) <= grid.halfExtentM && Math.abs(northM) <= grid.halfExtentM;

// Profiles depend only on the grid, the position and the mast height, so adding one object
// costs one profile instead of re-marching every placed object.
const profileCache = new WeakMap<DemGrid, Map<string, number[]>>();
export function cachedHorizonProfile(grid: DemGrid, eastM: number, northM: number, type: Placement["type"]): number[] {
  let perGrid = profileCache.get(grid);
  if (!perGrid) { perGrid = new Map(); profileCache.set(grid, perGrid); }
  const key = `${eastM}|${northM}|${type}`;
  let profile = perGrid.get(key);
  if (!profile) {
    profile = horizonProfile(grid, eastM, northM, BIN_DEG, OBSERVER_HEIGHT_M[type]);
    perGrid.set(key, profile);
    if (perGrid.size > 400) perGrid.delete(perGrid.keys().next().value!);
  }
  return profile;
}

export type CommWindow = VisibilityWindow;

export type SolarArrayResult = {
  id: string; label: string; eastM: number; northM: number;
  /** Generated power (kW) at each sample; a tracking panel always faces the Sun, so only blocking matters. */
  kw: Float64Array;
  peakKw: number; energyKWh: number; sunHours: number;
  /** Each sample: any part of the Sun's disc visible. */
  sunOn: boolean[];
  /** Continuous daylight periods, and the longest day and longest night inside the analysed period. */
  windows: CommWindow[]; longestDayHours: number; longestNightHours: number;
  /** Hours (disc-weighted) the Sun is above this array's own geometric horizon, ignoring terrain. */
  aboveHorizonHours: number;
  /** Energy the array would make over the period with no terrain at all (Sun distance included). */
  clearSkyKWh: number;
};

/** Rated output of one tracking array facing a full Sun at 1 AU, in kW. */
export const SOLAR_ARRAY_RATED_KW = (SOLAR_CONSTANT_W_M2 * SOLAR_ARRAY_AREA_M2 * SOLAR_ARRAY_EFFICIENCY) / 1000;

export type CommsResult = {
  id: string; label: string; eastM: number; northM: number;
  /** Earth's elevation in this mast's own frame, and the terrain horizon toward it (degrees). */
  earthEl: Float64Array; horizon: Float64Array;
  on: boolean[]; windows: CommWindow[]; visibleHours: number;
  /** Longest contact window and longest gap without Earth inside the analysed period. */
  longestWindowHours: number; longestGapHours: number;
};

export type HardwareAnalysis = { xs: Float64Array; stepHours: number; solar: SolarArrayResult[]; comms: CommsResult[]; outside: string[] };

export function analyseHardware(grid: DemGrid, centerLatDeg: number, samples: Sample[], placements: Placement[], endMs?: number): HardwareAnalysis {
  const n = samples.length;
  const xs = Float64Array.from(samples, (s) => s.t);
  const stepMs = n > 1 ? xs[1] - xs[0] : 3_600_000;
  const stepHours = stepMs / 3_600_000;
  const solar: SolarArrayResult[] = [], comms: CommsResult[] = [], outside: string[] = [];

  for (const p of placements) {
    if (p.type !== "solar" && p.type !== "comms") continue;
    if (!insideGrid(grid, p.eastM, p.northM)) { outside.push(p.id); continue; }
    const profile = cachedHorizonProfile(grid, p.eastM, p.northM, p.type);
    if (p.type === "solar") {
      const kw = new Float64Array(n), sunOn: boolean[] = [];
      let peakKw = 0, energyKWh = 0, sunHours = 0, aboveHorizonHours = 0, clearSkyKWh = 0;
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        const sun = skyAtLocal(centerLatDeg, p.eastM, p.northM, s.sunAz, s.sunEl);
        const visible = sun.elevationDeg < -0.5 ? 0 : discVisibleFraction(sun.elevationDeg, Math.max(0, maskAt(profile, BIN_DEG, sun.azimuthDeg)));
        const geometric = sun.elevationDeg < -0.5 ? 0 : discVisibleFraction(sun.elevationDeg, 0);
        const fullKw = (SOLAR_CONSTANT_W_M2 / (s.sunRangeAu * s.sunRangeAu)) * SOLAR_ARRAY_AREA_M2 * SOLAR_ARRAY_EFFICIENCY / 1000;
        kw[i] = fullKw * visible;
        peakKw = Math.max(peakKw, kw[i]);
        const intervalHours = Math.max(0, Math.min(s.t + stepMs, endMs ?? Infinity) - s.t) / 3_600_000;
        energyKWh += kw[i] * intervalHours;
        sunHours += visible * intervalHours;
        aboveHorizonHours += geometric * intervalHours;
        clearSkyKWh += fullKw * geometric * intervalHours;
        sunOn.push(visible > 0);
      }
      const windows = windowsFrom(xs, sunOn, stepMs, endMs);
      solar.push({
        id: p.id, label: `Solar array ${solar.length + 1}`, eastM: p.eastM, northM: p.northM, kw, peakKw, energyKWh, sunHours, sunOn, windows, aboveHorizonHours, clearSkyKWh,
        longestDayHours: windows.reduce((m, w) => Math.max(m, w.hours), 0),
        longestNightHours: windowsFrom(xs, sunOn.map((v) => !v), stepMs, endMs).reduce((m, w) => Math.max(m, w.hours), 0),
      });
    } else {
      const earthEl = new Float64Array(n), horizon = new Float64Array(n), on: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        const earth = skyAtLocal(centerLatDeg, p.eastM, p.northM, s.earthAz, s.earthEl);
        const h = Math.max(0, maskAt(profile, BIN_DEG, earth.azimuthDeg));
        earthEl[i] = earth.elevationDeg;
        horizon[i] = h;
        on.push(discVisibleFraction(earth.elevationDeg, h, EARTH_RADIUS_DEG) > 0);
      }
      const windows = windowsFrom(xs, on, stepMs, endMs);
      comms.push({
        id: p.id, label: `Comms mast ${comms.length + 1}`, eastM: p.eastM, northM: p.northM, earthEl, horizon, on, windows, visibleHours: windows.reduce((sum, w) => sum + w.hours, 0),
        longestWindowHours: windows.reduce((m, w) => Math.max(m, w.hours), 0),
        longestGapHours: windowsFrom(xs, on.map((v) => !v), stepMs, endMs).reduce((m, w) => Math.max(m, w.hours), 0),
      });
    }
  }
  return { xs, stepHours, solar, comms, outside };
}

/**
 * Where a set of arrays' energy went over a period, against the rated output for every hour of it.
 * `nightKWh` is lost because the Sun is below each array's geometric horizon (it also absorbs the
 * few-percent Sun-distance effect); `terrainKWh` is lost to loaded terrain while the Sun is up.
 * Hours are averages per array. Terrain beyond the loaded grid is not seen, so shadow is a lower bound.
 */
export function solarShortfall(arrays: Pick<SolarArrayResult, "energyKWh" | "sunHours" | "aboveHorizonHours" | "clearSkyKWh">[], periodHours = 24) {
  const n = arrays.length;
  const sum = (f: (a: (typeof arrays)[number]) => number) => arrays.reduce((total, a) => total + f(a), 0);
  const generatedKWh = sum((a) => a.energyKWh);
  const potentialKWh = n * SOLAR_ARRAY_RATED_KW * periodHours;
  const clearSkyKWh = sum((a) => a.clearSkyKWh);
  const sunHours = n ? sum((a) => a.sunHours) / n : 0;
  const aboveHorizonHours = n ? sum((a) => a.aboveHorizonHours) / n : 0;
  return {
    generatedKWh, potentialKWh, gapKWh: Math.max(0, potentialKWh - generatedKWh),
    sharePercent: potentialKWh > 0 ? (generatedKWh / potentialKWh) * 100 : 0,
    nightKWh: Math.max(0, potentialKWh - clearSkyKWh), terrainKWh: Math.max(0, clearSkyKWh - generatedKWh),
    sunHours, nightHours: Math.max(0, periodHours - aboveHorizonHours), terrainHours: Math.max(0, aboveHorizonHours - sunHours),
  };
}

/** One array right now: the Sun's elevation and the terrain horizon toward it, in the array's own frame. */
export type SolarNow = { outsideTerrain: boolean; sunElevationDeg: number | null; horizonDeg: number | null; visible: number };
export type SolarReason = { kind: "outside" | "night" | "horizon" | "terrain" | "partial" | "low" | "full" | "unknown"; count: number; text: string };

const SUN_RADIUS = 0.27;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const range = (values: number[], f: (v: number) => string) => {
  const lo = Math.min(...values), hi = Math.max(...values);
  return f(lo) === f(hi) ? f(lo) : `${f(lo)}–${f(hi)}`;
};

/** Why each array is (or is not) at full output now, grouped so several arrays read as a few lines. */
export function explainSolarNow(arrays: SolarNow[]): SolarReason[] {
  const groups = new Map<SolarReason["kind"], SolarNow[]>();
  const add = (kind: SolarReason["kind"], a: SolarNow) => groups.set(kind, [...(groups.get(kind) ?? []), a]);
  for (const a of arrays) {
    if (a.outsideTerrain) add("outside", a);
    else if (a.sunElevationDeg === null) add("unknown", a);
    else if (a.sunElevationDeg <= -SUN_RADIUS) add("night", a);
    else if ((a.horizonDeg ?? 0) <= 0 && a.visible < 0.99) add("horizon", a);
    else if (a.visible <= 0) add("terrain", a);
    else if (a.visible < 0.99) add("partial", a);
    else if (a.sunElevationDeg < 5) add("low", a);
    else add("full", a);
  }
  const order: SolarReason["kind"][] = ["outside", "night", "horizon", "terrain", "partial", "low", "full", "unknown"];
  return order.filter((kind) => groups.has(kind)).map((kind) => {
    const list = groups.get(kind)!;
    const els = list.map((a) => a.sunElevationDeg ?? 0), ridges = list.map((a) => a.horizonDeg ?? 0);
    const deg = (v: number) => `${v.toFixed(1)}°`;
    const text = kind === "outside" ? "Outside the loaded terrain: no sunlight result. Increase the radius."
      : kind === "night" ? `Sun below the horizon (${range(els, deg)}): lunar night here.`
      : kind === "horizon" ? `Sun on the horizon (rising or setting): ${range(list.map((a) => 1 - a.visible), pct)} of the disc below it.`
      : kind === "terrain" ? `Sun blocked by terrain: 100% of the disc hidden (ridge ${range(ridges, deg)}, Sun ${range(els, deg)}).`
      : kind === "partial" ? `Sun partly behind terrain: ${range(list.map((a) => 1 - a.visible), pct)} of the disc hidden.`
      : kind === "low" ? `Full disc, but the Sun is only ${range(els, deg)} up: a small ridge would block it.`
      : kind === "full" ? "Full Sun: at rated output (the panel tracks the Sun)."
      : "Waiting for Sun position.";
    return { kind, count: list.length, text };
  });
}
