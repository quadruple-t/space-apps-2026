/**
 * The single implementation of Sun/Earth sky evaluation used by BOTH the /api/v1/science/*
 * handlers and Freeplay's client graphs (lib/lunar-data.ts). Ephemeris interpolation lives
 * in lib/ephemeris, mask interpolation in lib/terrain/mask; this module combines them so the
 * visibility decision (`elevation > horizon at azimuth`) exists in exactly one place.
 */
import { azElFromCartesian, type CartesianSeries, type SiteFrame } from "@/lib/ephemeris";
import { maskAt } from "@/lib/terrain/mask";

export const AU_KM = 149_597_870.7;

/** Terrain horizon as bins (bin 0 = north, clockwise). `null` elevations = smooth-sphere horizon. */
export type HorizonProfile = { elevationsDeg: ArrayLike<number> | null; azimuthStepDeg: number };

export function horizonElevationAt(h: HorizonProfile, azimuthDeg: number): number {
  return h.elevationsDeg ? maskAt(h.elevationsDeg, h.azimuthStepDeg, azimuthDeg) : 0;
}

export type SkyPoint = {
  t: number;
  sunAz: number; sunEl: number; sunHorizon: number; sunVisible: boolean; sunRangeAu: number;
  earthAz: number; earthEl: number; earthHorizon: number; earthVisible: boolean;
};

export function skyAt(series: CartesianSeries, frame: SiteFrame, horizon: HorizonProfile, t: number): SkyPoint {
  const { sun, earth } = series.at(t);
  const s = azElFromCartesian(frame, sun), e = azElFromCartesian(frame, earth);
  const sunHorizon = horizonElevationAt(horizon, s.azimuthDeg), earthHorizon = horizonElevationAt(horizon, e.azimuthDeg);
  return {
    t,
    sunAz: s.azimuthDeg, sunEl: s.elevationDeg, sunHorizon, sunVisible: s.elevationDeg > sunHorizon, sunRangeAu: Math.hypot(...sun) / AU_KM,
    earthAz: e.azimuthDeg, earthEl: e.elevationDeg, earthHorizon, earthVisible: e.elevationDeg > earthHorizon,
  };
}

/** Samples at [startMs, endMs] (inclusive) every stepMinutes, clamped to the series coverage. */
export function skySamples(series: CartesianSeries, frame: SiteFrame, horizon: HorizonProfile, startMs: number, endMs: number, stepMinutes: number): SkyPoint[] {
  const out: SkyPoint[] = [];
  const end = Math.min(endMs, series.endMs);
  for (let t = Math.max(startMs, series.startMs); t <= end; t += stepMinutes * 60_000) out.push(skyAt(series, frame, horizon, t));
  return out;
}

/** Longest run of `value` in flags, in hours (`stepHours` per flag). */
export function longestRunHours(flags: boolean[], value: boolean, stepHours: number): number {
  let best = 0, cur = 0;
  for (const f of flags) { cur = f === value ? cur + 1 : 0; if (cur > best) best = cur; }
  return Number((best * stepHours).toFixed(1));
}
