import { describe, expect, it } from "vitest";
import { compositionAt, decodeCompositionGrid, surfaceDistanceKm } from "@/lib/science/composition";

const OXIDES = ["FeO", "TiO2", "Al2O3", "CaO", "MgO", "SiO2"];
/** Pixels: [minLat, maxLat, minLon, maxLon] in degrees, values in wt%. */
function grid(pixels: { b: [number, number, number, number]; v: number[]; s?: number[] }[]) {
  const bounds = new Int16Array(pixels.flatMap((p) => p.b.map((x) => Math.round(x * 10))));
  const values = new Uint16Array(pixels.flatMap((p) => p.v.map((x) => Math.round(x * 100))));
  const sigma = new Uint16Array(pixels.flatMap((p) => (p.s ?? p.v.map(() => 0.5)).map((x) => Math.round(x * 100))));
  const u8 = (a: Int16Array | Uint16Array) => new Uint8Array(a.buffer);
  return { count: pixels.length, oxides: OXIDES, bounds: u8(bounds), values: u8(values), sigma: u8(sigma), pixelDeg: 2, resolutionKm: 60, product: "test", citation: "test", caveats: [] };
}

const doc = grid([
  { b: [-90, -88, -180, 180], v: [5, 0.3, 28, 16, 5, 44] },
  { b: [20, 22, 30, 32], v: [17.2, 6.1, 12.4, 11.1, 9.3, 43.5], s: [0.6, 0.5, 0.9, 0.8, 1.1, 0.7] },
  { b: [88, 90, 170, 180], v: [4, 0.2, 29, 16, 4, 45] },
]);

describe("composition grid", () => {
  it("decodes the stored payload and rejects a count mismatch", () => {
    const g = decodeCompositionGrid(doc);
    expect(g.count).toBe(3);
    expect(() => decodeCompositionGrid({ ...doc, count: 4 })).toThrow(/does not match/);
    expect(() => decodeCompositionGrid({ ...doc, oxides: OXIDES.slice(1) })).toThrow();
  });

  it("finds the pixel containing a mid-latitude point and reports its centre and distance", () => {
    const hit = compositionAt(decodeCompositionGrid(doc), 20.19, 30.77)!;
    expect(hit.oxidesWtPct).toMatchObject({ FeO: 17.2, TiO2: 6.1, CaO: 11.1 });
    expect(hit.sigmaWtPct.FeO).toBe(0.6);
    expect(hit.pixel).toMatchObject({ index: 1, centerLatDeg: 21, centerLonDeg: 31, sizeDeg: 2 });
    expect(hit.pixel.distanceKm).toBeGreaterThan(0);
    expect(hit.pixel.distanceKm).toBeLessThan(60);
  });

  it("covers the poles, including the exact pole and the antimeridian edge", () => {
    const g = decodeCompositionGrid(doc);
    expect(compositionAt(g, -89.9, 123)!.pixel.index).toBe(0);
    expect(compositionAt(g, -90, 0)!.pixel.index).toBe(0);
    expect(compositionAt(g, 90, 180)!.pixel.index).toBe(2);
  });

  it("accepts 0-360 longitudes and returns null where the grid has a gap", () => {
    const g = decodeCompositionGrid(doc);
    expect(compositionAt(g, 21, 31 + 360)!.pixel.index).toBe(1);
    expect(compositionAt(g, 0, 0)).toBeNull();
  });

  it("measures surface distance on the lunar sphere", () => {
    expect(surfaceDistanceKm(0, 0, 0, 0)).toBe(0);
    // One degree of latitude is about 30.3 km on a 1737.4 km sphere.
    expect(surfaceDistanceKm(0, 0, 1, 0)).toBeCloseTo(30.32, 1);
  });
});
