import { describe, expect, it } from "vitest";
import { summarizeSetup } from "@/lib/setup-performance";
import type { HardwareAnalysis, CommsResult, SolarArrayResult } from "@/lib/hardware-analysis";
const H = 3_600_000;
const mast = (id: string, on: boolean[], clear = on): CommsResult => ({ id, label: id, eastM: 0, northM: 0, earthEl: Float64Array.from(clear, (v, i) => v ? 10 : on[i] ? 0 : -10), horizon: new Float64Array(on.length), on, windows: [], visibleHours: 0, longestWindowHours: 0, longestGapHours: 0 });
const array = (kw: number[]): SolarArrayResult => ({ id: "solar", label: "Solar", eastM: 0, northM: 0, kw: Float64Array.from(kw), peakKw: Math.max(...kw), energyKWh: kw.slice(0, -1).reduce((sum, n) => sum + n, 0), sunHours: 0, sunOn: [], windows: [], longestDayHours: 0, longestNightHours: 0 });
const analysis = (comms: CommsResult[], solar: SolarArrayResult[] = []): HardwareAnalysis => ({ xs: Float64Array.from([0, H, 2 * H, 3 * H, 4 * H]), stepHours: 1, comms, solar });
describe("habitat setup performance", () => {
  it("counts overlapping mast coverage once and allows complementary coverage", () => {
    const result = summarizeSetup(analysis([mast("A", [true, true, false, false, false]), mast("B", [false, true, true, false, false])]), 4 * H);
    expect(result.contactHours).toBe(3);
    expect(result.longestWindowHours).toBe(3);
    expect(result.longestGapHours).toBe(1);
  });
  it("distinguishes partial Earth visibility from full disc clearance", () => {
    const result = summarizeSetup(analysis([mast("A", [true, true, true, false, false], [false, true, false, false, false])]), 4 * H);
    expect(result.contactHours).toBe(3);
    expect(result.clearHours).toBe(1);
  });
  it("sums solar output at the same instant instead of adding unrelated peaks", () => {
    const result = summarizeSetup(analysis([], [array([5, 0, 2, 0, 0]), array([0, 6, 2, 0, 0])]), 4 * H);
    expect([...result.totalKw]).toEqual([5, 6, 4, 0, 0]);
    expect(result.peakKw).toBe(6);
    expect(result.energyKWh).toBe(15);
  });
  it("reports zero coverage and a full blackout when no mast sees Earth", () => {
    const result = summarizeSetup(analysis([mast("A", [false, false, false, false, false])]), 4 * H);
    expect(result.contactHours).toBe(0);
    expect(result.longestGapHours).toBe(4);
  });
});
