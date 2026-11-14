import { describe, expect, it } from "vitest";
import {
  CartesianSeries, azElFromCartesian, computeTopocentricFromChunks, monthChunkIds, siteFrame, topocentricAzEl,
} from "@/lib/ephemeris";
import { loadChunk, readSeed } from "./helpers/seed";

interface Fixture {
  toleranceDeg: number;
  epochs: string[];
  subpoints: number[][];
  seriesChunkIds: string[];
  sites: { name: string; latDeg: number; lonDeg: number; sun: { azEl: number[][] }; earth: { azEl: number[][] } }[];
}

const fx = readSeed<Fixture>("fixtures/topocentric-check.json");
const TOL = 0.02;
const angDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

describe("topocentric math vs direct JPL Horizons (quantity 4)", () => {
  it("fixture has 5 sites x ~30 epochs", () => {
    expect(fx.sites).toHaveLength(5);
    expect(fx.epochs.length).toBeGreaterThanOrEqual(30);
    expect(fx.toleranceDeg).toBe(TOL);
  });

  for (const site of fx.sites) {
    it(`exact sub-points: ${site.name} within ${TOL}°`, () => {
      fx.epochs.forEach((_, i) => {
        const [sLat, sLon, sD, eLat, eLon, eD] = fx.subpoints[i];
        for (const [body, ref] of [[topocentricAzEl(site.latDeg, site.lonDeg, sLat, sLon, sD), site.sun.azEl[i]],
          [topocentricAzEl(site.latDeg, site.lonDeg, eLat, eLon, eD), site.earth.azEl[i]]] as const) {
          expect(Math.abs(body.elevationDeg - ref[1])).toBeLessThanOrEqual(TOL);
          const cosEl = Math.cos((ref[1] * Math.PI) / 180);
          expect(Math.abs(angDiff(body.azimuthDeg, ref[0])) * cosEl).toBeLessThanOrEqual(TOL);
        }
      });
    });

    it(`stored 1 h series, interpolated: ${site.name} within ${TOL}°`, () => {
      const series = new CartesianSeries(fx.seriesChunkIds.map(loadChunk));
      const frame = siteFrame(site.latDeg, site.lonDeg);
      fx.epochs.forEach((t, i) => {
        const { sun, earth } = series.at(Date.parse(t));
        for (const [v, ref] of [[azElFromCartesian(frame, sun), site.sun.azEl[i]], [azElFromCartesian(frame, earth), site.earth.azEl[i]]] as const) {
          expect(Math.abs(v.elevationDeg - ref[1])).toBeLessThanOrEqual(TOL);
          expect(Math.abs(angDiff(v.azimuthDeg, ref[0])) * Math.cos((ref[1] * Math.PI) / 180)).toBeLessThanOrEqual(TOL);
        }
      });
    });
  }
});

describe("Apollo 11 spot check", () => {
  it("Sun elevation at 1969-07-20T20:17:40Z is 10.70 ± 0.02° (Horizons direct 10.7033°)", () => {
    const r = computeTopocentricFromChunks([loadChunk("hist-apollo-11-tranquility")], 0.67416, 23.47314, "1969-07-20T20:17:40Z");
    expect(r.sun.elevationDeg).toBeCloseTo(10.7033, 2);
    expect(Math.abs(r.sun.elevationDeg - 10.7033)).toBeLessThan(0.02);
    expect(Math.abs(r.sun.azimuthDeg - 88.8055)).toBeLessThan(0.02);
    expect(Math.abs(r.earth.elevationDeg - 59.2242)).toBeLessThan(0.02);
  });
});

describe("series helpers", () => {
  it("monthChunkIds spans month boundaries and includes the next chunk for the last hour", () => {
    expect(monthChunkIds("2027-03-10T00:00:00Z", "2027-03-20T00:00:00Z")).toEqual(["2027-03"]);
    expect(monthChunkIds("2027-03-31T23:30:00Z", "2027-04-01T00:30:00Z")).toEqual(["2027-03", "2027-04"]);
    expect(monthChunkIds("2027-12-20T00:00:00Z", "2028-01-05T00:00:00Z")).toEqual(["2027-12", "2028-01"]);
  });

  it("interpolation is continuous across a chunk boundary", () => {
    const s = new CartesianSeries([loadChunk("2027-03"), loadChunk("2027-04")]);
    const t = Date.parse("2027-04-01T00:00:00Z");
    const a = s.at(t - 1);
    const b = s.at(t + 1);
    expect(Math.hypot(a.earth[0] - b.earth[0], a.earth[1] - b.earth[1], a.earth[2] - b.earth[2])).toBeLessThan(1);
  });

  it("rejects non-contiguous chunks and out-of-range times", () => {
    expect(() => new CartesianSeries([loadChunk("2027-03"), loadChunk("2027-05")])).toThrow(/contiguous/);
    const s = new CartesianSeries([loadChunk("2027-03")]);
    expect(() => s.at(Date.parse("2027-04-02T00:00:00Z"))).toThrow(RangeError);
  });
});
