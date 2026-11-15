import { describe, expect, it } from "vitest";
import { computeMetrics, DEFAULT_METRICS, formatDelta, formatValue, isMetricKey, METRICS, metricValue, winnerFor, type MetricKey } from "@/lib/comparison";
import type { Sample } from "@/lib/illumination";

const HOUR = 3_600_000;
const def = (key: MetricKey) => METRICS.find((m) => m.key === key)!;

/** One sample per hour; `sun` and `earth` give elevation in degrees, terrain horizon defaults to flat. */
function series(sun: number[], earth: number[], sunHorizon = 0): Sample[] {
  return sun.map((sunEl, i) => ({
    t: Date.UTC(2026, 11, 1) + i * HOUR,
    sunAz: 90, sunEl, sunHorizon, sunRangeAu: 1,
    earthAz: 180, earthEl: earth[i], earthHorizon: 0,
  }));
}

describe("computeMetrics", () => {
  it("returns null without samples", () => {
    expect(computeMetrics([], 1, 0.3)).toBeNull();
  });

  it("counts sunlit and Earth-visible hours and the longest gaps", () => {
    // Sun: 6 h up, 4 h down. Earth: down 2 h, up 5 h, down 3 h.
    const m = computeMetrics(series([10, 10, 10, 10, 10, 10, -5, -5, -5, -5], [-1, -1, 4, 4, 4, 4, 4, -2, -2, -2]), 1, 1)!;
    expect(m.hours).toBe(10);
    expect(m.sunlightHours).toBe(6);
    expect(m.sunlightPct).toBeCloseTo(60);
    expect(m.longestDarkHours).toBe(4);
    expect(m.earthPct).toBeCloseTo(50);
    expect(m.longestBlackoutHours).toBe(3);
    expect(m.peakSunEl).toBe(10);
  });

  it("treats the Sun as down while terrain hides it, even above the geometric horizon", () => {
    const m = computeMetrics(series([10, 10, 10, 10], [5, 5, 5, 5], 15), 1, 1)!;
    expect(m.sunlightHours).toBe(0);
    expect(m.longestDarkHours).toBe(4);
    expect(m.energyKWh).toBe(0);
  });

  it("scales energy with panel area and efficiency using a flat panel", () => {
    const samples = series([30, 30], [5, 5]);
    const perM2 = (1361 * Math.sin((30 * Math.PI) / 180) * 2) / 1000;
    expect(computeMetrics(samples, 1, 1)!.energyKWh).toBeCloseTo(perM2);
    expect(computeMetrics(samples, 4, 0.25)!.energyKWh).toBeCloseTo(perM2);
    expect(computeMetrics(samples, 2, 0.5)!.energyKWh).toBeCloseTo(perM2);
  });
});

describe("comparison helpers", () => {
  it("picks the higher value where higher is better and the lower where lower is better", () => {
    expect(winnerFor(def("sunlightPct"), 80, 60)).toBe("a");
    expect(winnerFor(def("sunlightPct"), 60, 80)).toBe("b");
    expect(winnerFor(def("longestDarkHours"), 30, 90)).toBe("a");
    expect(winnerFor(def("slopeDeg"), 12, 4)).toBe("b");
  });

  it("ties values that display identically", () => {
    expect(winnerFor(def("sunlightPct"), 50.01, 50.04)).toBe("tie");
    expect(winnerFor(def("sunlightPct"), 50.0, 50.2)).toBe("b");
  });

  it("names no winner where neither direction is better, for flags, or when a side has no value", () => {
    expect(winnerFor(def("elevationM"), -1900, 5300)).toBe("none");
    expect(winnerFor(def("insidePsr"), true, false)).toBe("none");
    expect(winnerFor(def("slopeDeg"), null, 4)).toBe("none");
    expect(winnerFor(def("slopeDeg"), undefined, 4)).toBe("none");
  });

  it("formats values, flags and gaps", () => {
    expect(formatValue(def("sunlightPct"), 61.234)).toBe("61.2%");
    expect(formatValue(def("elevationM"), 5321.4)).toBe("5321 m");
    expect(formatValue(def("insidePsr"), true)).toBe("Yes");
    expect(formatValue(def("insidePsr"), false)).toBe("No");
    expect(formatValue(def("slopeDeg"), null)).toBe("No data");
    expect(formatValue(def("slopeDeg"), undefined)).toBe("—");
  });

  it("formats signed differences at the displayed precision", () => {
    expect(formatDelta(def("sunlightPct"), 50, 61.25)).toBe("+11.3%");
    expect(formatDelta(def("longestDarkHours"), 120, 100)).toBe("−20 h");
    expect(formatDelta(def("sunlightPct"), 50.01, 50.02)).toBe("0%");
    expect(formatDelta(def("slopeDeg"), null, 4)).toBe("—");
    expect(formatDelta(def("insidePsr"), true, false)).toBe("—");
  });
});

describe("metric registry", () => {
  const window = computeMetrics(series([10, 10, -5, -5], [4, 4, 4, 4]), 1, 1)!;

  it("reads window metrics and terrain facts from the right place", () => {
    const v = { window, terrain: { slopeDeg: 6.5, elevationM: null, insidePsr: false } };
    expect(metricValue(def("sunlightPct"), v)).toBeCloseTo(50);
    expect(metricValue(def("slopeDeg"), v)).toBe(6.5);
    expect(metricValue(def("insidePsr"), v)).toBe(false);
  });

  it("tells a value that is still loading from one the data does not have", () => {
    const loading = { window: null, terrain: null };
    expect(metricValue(def("sunlightPct"), loading)).toBeUndefined();
    expect(metricValue(def("slopeDeg"), loading)).toBeUndefined();
    const noTerrain = { window, terrain: { slopeDeg: null, elevationM: null, insidePsr: null } };
    expect(metricValue(def("slopeDeg"), noTerrain)).toBeNull();
    expect(metricValue(def("insidePsr"), noTerrain)).toBeNull();
  });

  it("uses regional oxide measurements and hides values below twice their uncertainty", () => {
    const composition = {
      oxidesWtPct: { FeO: 10, TiO2: 0.5, Al2O3: 16, CaO: 12, MgO: 9, SiO2: 45 },
      sigmaWtPct: { FeO: 1, TiO2: 0.4, Al2O3: 1, CaO: 1, MgO: 1, SiO2: 1 }, resolutionKm: 60,
    };
    const values = { window, terrain: null, composition, meteorExposure: 42 };
    expect(metricValue(def("ironOxide"), values)).toBe(10);
    expect(metricValue(def("titaniumOxide"), values)).toBe("low-confidence");
    expect(formatValue(def("titaniumOxide"), "low-confidence")).toBe("Low confidence");
    expect(metricValue(def("meteorExposure"), values)).toBe(42);
    expect(winnerFor(def("ironOxide"), 10, 20)).toBe("none");
    expect(metricValue(def("ironOxide"), { window, terrain: null, composition: null })).toBeNull();
  });

  it("has unique keys, a map-layer metric for each layer, and valid defaults", () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length);
    expect(METRICS.filter((m) => m.layer).map((m) => m.layer).sort()).toEqual(["Elevation", "Illumination", "Meteor showers", "Permanently shadowed", "Slope"]);
    expect(DEFAULT_METRICS.every(isMetricKey)).toBe(true);
    expect(isMetricKey("nearestPsrKm")).toBe(false);
  });
});
