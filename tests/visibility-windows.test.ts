import { describe, expect, it } from "vitest";
import { longestWindowHours, windowHours, windowsFrom } from "@/lib/visibility-windows";

const HOUR = 3_600_000;
describe("availability window durations", () => {
  it("does not count the inclusive mission endpoint as an extra hour", () => {
    const windows = windowsFrom([0, HOUR, 2 * HOUR, 3 * HOUR], [true, true, true, true], HOUR, 3 * HOUR);
    expect(windowHours(windows)).toBe(3);
    expect(longestWindowHours(windows)).toBe(3);
  });
  it("clips partial hours and reports separate windows", () => {
    expect(windowsFrom([0, HOUR, 2 * HOUR, 3 * HOUR], [true, false, true, true], HOUR, 2.5 * HOUR)).toEqual([
      { startMs: 0, endMs: HOUR, hours: 1 },
      { startMs: 2 * HOUR, endMs: 2.5 * HOUR, hours: 0.5 },
    ]);
  });
  it("does not invent contact across missing samples", () => {
    const windows = windowsFrom([0, HOUR, 4 * HOUR], [true, true, true], HOUR);
    expect(windows.map((window) => window.hours)).toEqual([2, 1]);
  });
  it("handles no availability and empty or zero-length periods", () => {
    expect(windowsFrom([], [], HOUR)).toEqual([]);
    expect(windowsFrom([0, HOUR], [false, false], HOUR)).toEqual([]);
    expect(windowsFrom([0], [true], HOUR, 0)).toEqual([]);
    expect(longestWindowHours([])).toBe(0);
  });
});
