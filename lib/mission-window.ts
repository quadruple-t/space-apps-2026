import type { LunarSite, MissionMetrics } from "@/integrations/science/types";
import { siteFrame, type CartesianSeries } from "@/lib/ephemeris";
import type { TerrainHorizon } from "@/lib/lunar-data";
import { longestRunHours, skySamples } from "@/lib/science/sky";

const STEP_MINUTES = 10;
const STEP_MS = STEP_MINUTES * 60_000;
const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 3_600_000;

/** A rolling window follows the simulation clock at the resolution of its samples. */
export const missionWindowStart = (timeMs: number) => Math.floor(timeMs / STEP_MS) * STEP_MS;

/**
 * The next 24 hours at the selected site's centre, using the same sky and
 * terrain-horizon calculations and 10-minute sampling as the science API.
 * A partial window is never presented as a full day.
 */
export function calculateMissionWindow(series: CartesianSeries, site: LunarSite, horizon: TerrainHorizon, timeMs: number): MissionMetrics | null {
  if (!Number.isFinite(timeMs)) return null;
  const start = missionWindowStart(timeMs), end = start + WINDOW_MS;
  if (!series.covers(start) || !series.covers(end)) return null;
  const points = skySamples(series, siteFrame(site.latitudeDeg, site.longitudeDeg), horizon, start, end - 1, STEP_MINUTES);
  if (points.length !== WINDOW_MS / STEP_MS) return null;
  const sunlight = points.map((point) => point.sunVisible);
  const earth = points.map((point) => point.earthVisible);
  const share = (flags: boolean[]) => flags.filter(Boolean).length / flags.length;
  const sunShare = share(sunlight), earthShare = share(earth);
  return {
    sunlightPercent: Math.round(sunShare * 100),
    sunlightHours: Number((sunShare * WINDOW_HOURS).toFixed(1)),
    earthVisibilityPercent: Math.round(earthShare * 100),
    longestBlackoutHours: longestRunHours(earth, false, STEP_MINUTES / 60),
    intervalStart: new Date(start).toISOString(),
    intervalEnd: new Date(end).toISOString(),
    horizonSource: horizon.source,
    provenance: "scientific",
  };
}
