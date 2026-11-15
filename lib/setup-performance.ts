import type { HardwareAnalysis } from "./hardware-analysis";
import { EARTH_RADIUS_DEG } from "./terrain/dem";
import { windowsFrom, windowHours, longestWindowHours } from "./visibility-windows";

/** A shared solar bus and the union of mast visibility; overlapping contacts are counted once. */
export function summarizeSetup(analysis: HardwareAnalysis, endMs: number) {
  const totalKw = Float64Array.from(analysis.xs, (_, i) => analysis.solar.reduce((sum, array) => sum + array.kw[i], 0));
  const contact = Array.from(analysis.xs, (_, i) => analysis.comms.some((mast) => mast.on[i]));
  const clear = Array.from(analysis.xs, (_, i) => analysis.comms.some((mast) => mast.earthEl[i] >= mast.horizon[i] + EARTH_RADIUS_DEG));
  const stepMs = analysis.stepHours * 3_600_000;
  const windows = windowsFrom(analysis.xs, contact, stepMs, endMs);
  const clearHours = windowHours(windowsFrom(analysis.xs, clear, stepMs, endMs));
  return {
    totalKw, peakKw: totalKw.reduce((max, kw) => Math.max(max, kw), 0),
    energyKWh: analysis.solar.reduce((sum, array) => sum + array.energyKWh, 0),
    contactHours: windowHours(windows), clearHours, windows,
    longestWindowHours: longestWindowHours(windows),
    longestGapHours: longestWindowHours(windowsFrom(analysis.xs, contact.map((value) => !value), stepMs, endMs)),
  };
}
