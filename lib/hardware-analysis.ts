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
 * results are upper bounds near its edge.
 */

const BIN_DEG = 3;

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
};

export type CommsResult = {
  id: string; label: string; eastM: number; northM: number;
  /** Earth's elevation in this mast's own frame, and the terrain horizon toward it (degrees). */
  earthEl: Float64Array; horizon: Float64Array;
  on: boolean[]; windows: CommWindow[]; visibleHours: number;
  /** Longest contact window and longest gap without Earth inside the analysed period. */
  longestWindowHours: number; longestGapHours: number;
};

export type HardwareAnalysis = { xs: Float64Array; stepHours: number; solar: SolarArrayResult[]; comms: CommsResult[] };

export function analyseHardware(grid: DemGrid, centerLatDeg: number, samples: Sample[], placements: Placement[], endMs?: number): HardwareAnalysis {
  const n = samples.length;
  const xs = Float64Array.from(samples, (s) => s.t);
  const stepMs = n > 1 ? xs[1] - xs[0] : 3_600_000;
  const stepHours = stepMs / 3_600_000;
  const solar: SolarArrayResult[] = [], comms: CommsResult[] = [];

  for (const p of placements) {
    if (p.type !== "solar" && p.type !== "comms") continue;
    const profile = horizonProfile(grid, p.eastM, p.northM, BIN_DEG, OBSERVER_HEIGHT_M[p.type]);
    if (p.type === "solar") {
      const kw = new Float64Array(n), sunOn: boolean[] = [];
      let peakKw = 0, energyKWh = 0, sunHours = 0;
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        const sun = skyAtLocal(centerLatDeg, p.eastM, p.northM, s.sunAz, s.sunEl);
        const visible = sun.elevationDeg < -0.5 ? 0 : discVisibleFraction(sun.elevationDeg, Math.max(0, maskAt(profile, BIN_DEG, sun.azimuthDeg)));
        kw[i] = (SOLAR_CONSTANT_W_M2 / (s.sunRangeAu * s.sunRangeAu)) * SOLAR_ARRAY_AREA_M2 * SOLAR_ARRAY_EFFICIENCY * visible / 1000;
        peakKw = Math.max(peakKw, kw[i]);
        const intervalHours = Math.max(0, Math.min(s.t + stepMs, endMs ?? Infinity) - s.t) / 3_600_000;
        energyKWh += kw[i] * intervalHours;
        sunHours += visible * intervalHours;
        sunOn.push(visible > 0);
      }
      const windows = windowsFrom(xs, sunOn, stepMs, endMs);
      solar.push({
        id: p.id, label: `Solar array ${solar.length + 1}`, eastM: p.eastM, northM: p.northM, kw, peakKw, energyKWh, sunHours, sunOn, windows,
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
  return { xs, stepHours, solar, comms };
}
