import { describe, expect, it } from "vitest";
import { RHO_80, RHO_84, llToStereo, maskAt, smoothHorizonMask, snapToGrid, stereoToLl } from "@/lib/terrain";

describe("maskAt", () => {
  const mask = new Float32Array(720);
  mask[0] = 2; mask[1] = 4; mask[719] = 6;

  it("interpolates between bins", () => {
    expect(maskAt(mask, 0.5, 0.25)).toBeCloseTo(3, 6);
  });
  it("wraps from the last bin to bin 0", () => {
    expect(maskAt(mask, 0.5, 359.75)).toBeCloseTo(4, 6); // halfway 6 -> 2
    expect(maskAt(mask, 0.5, 360)).toBeCloseTo(2, 6);
    expect(maskAt(mask, 0.5, -0.25)).toBeCloseTo(4, 6);
    expect(maskAt(mask, 0.5, 720.25)).toBeCloseTo(3, 6);
  });
  it("rejects masks that do not cover 360°", () => {
    expect(() => maskAt(new Float32Array(100), 0.5, 10)).toThrow();
  });
  it("smooth horizon is flat zero and flagged source 'none'", () => {
    const m = smoothHorizonMask();
    expect(m.source).toBe("none");
    expect(maskAt(m.maskElevationDeg, m.binDeg, 123)).toBe(0);
  });
});

describe("stereographic grid", () => {
  it("round-trips lat/lon", () => {
    const { x, y } = llToStereo(-85.427, 31.74);
    expect(x / 1000).toBeCloseTo(72.98, 1); // PGDA Site20 box centre (73, 118) km
    expect(y / 1000).toBeCloseTo(118.0, 1);
    const ll = stereoToLl(x, y);
    expect(ll.latDeg).toBeCloseTo(-85.427, 9);
    expect(ll.lonDeg).toBeCloseTo(31.74, 9);
  });

  it("snaps the Shackleton-rim test point (-89.45, -137.31) to a 2 km cell", () => {
    const s = snapToGrid(-89.45, -137.31);
    expect(s).not.toBeNull();
    expect(s!.tileId.startsWith("g2_")).toBe(true);
    expect(s!.gridSpacingKm).toBe(2);
    expect(s!.distanceKm).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    expect(s!.cellIndex).toBeGreaterThanOrEqual(0);
    expect(s!.cellIndex).toBeLessThan(256);
  });

  it("uses 5 km cells between 84°S and 80°S", () => {
    const s = snapToGrid(-82, 45);
    expect(s!.tileId.startsWith("g5_")).toBe(true);
    expect(s!.distanceKm).toBeLessThanOrEqual(5 * Math.SQRT1_2 + 0.05);
  });

  it("returns null outside 80–90°S", () => {
    expect(snapToGrid(-79.9, 0)).toBeNull();
    expect(snapToGrid(10, 0)).toBeNull();
  });

  it("picks a valid cell on both sides of the 84°S boundary", () => {
    for (const lat of [-83.98, -84, -84.02]) {
      const s = snapToGrid(lat, 10)!;
      const { x, y } = llToStereo(s.cellCenter.latDeg, s.cellCenter.lonDeg);
      const r = Math.hypot(x, y);
      if (s.tileId.startsWith("g2_")) expect(r).toBeLessThanOrEqual(RHO_84 + 1e-6);
      else expect(r > RHO_84 && r <= RHO_80).toBe(true);
    }
  });
});
