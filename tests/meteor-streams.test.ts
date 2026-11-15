import { describe, expect, test } from "vitest";
import { Cartesian3, JulianDate, Matrix3 } from "cesium";
import * as Cesium from "cesium";
// Cesium exports this reference orientation evaluator without public TypeScript declarations.
const { IauOrientationAxes } = Cesium as unknown as { IauOrientationAxes: new () => { evaluate: (date: JulianDate) => Matrix3 } };
import sheet from "@/data/seed/facts/meteor-streams-2026.json";
import radiants from "@/scripts/data-pipeline/curated/meteorStreams.json";
import type { FactSheet } from "@/lib/model/types";
import { meteorStreamsFromFacts, streamIncidence } from "@/lib/science/meteor-streams";
import { LAYERS, LAYER_CATEGORIES } from "@/scenes/cesium/moon-layers";
import { useFreeplay } from "@/lib/freeplay-store";

const streams = meteorStreamsFromFacts({ ...sheet, id: "meteor-streams-2026" } as FactSheet);
describe("meteor exposure references", () => {
  test("pipeline sub-radiants agree with Cesium's independent lunar orientation", () => {
    for (const source of radiants.streams) {
      const snapshot = streams.find((s) => s.name === source.name)!;
      const rad = Math.PI / 180;
      const inertial = new Cartesian3(Math.cos(source.decDeg * rad) * Math.cos(source.raDeg * rad), Math.cos(source.decDeg * rad) * Math.sin(source.raDeg * rad), Math.sin(source.decDeg * rad));
      const matrix = new IauOrientationAxes().evaluate(JulianDate.fromIso8601(source.referenceUtc));
      const fixed = Matrix3.multiplyByVector(matrix, inertial, new Cartesian3());
      expect(snapshot.latitudeDeg).toBeCloseTo(Math.asin(fixed.z) / rad, 3);
      expect(snapshot.longitudeDeg).toBeCloseTo(Math.atan2(fixed.y, fixed.x) / rad, 3);
    }
  });
  test("exposure peaks under the radiant and is zero on the opposite hemisphere", () => {
    for (const s of streams) {
      expect(streamIncidence(s.latitudeDeg, s.longitudeDeg, s)).toBeCloseTo(1);
      expect(streamIncidence(-s.latitudeDeg, s.longitudeDeg + 180, s)).toBe(0);
      expect(streamIncidence(s.latitudeDeg, s.longitudeDeg + 360, s)).toBeCloseTo(1);
    }
  });
  test("rejects invalid reference geometry", () => {
    expect(() => meteorStreamsFromFacts({ ...sheet, rows: [{ label: "Bad", unit: "latitude deg", value: 100 }] } as FactSheet)).toThrow();
  });
});

test("all exposed globe layers have state and a category", () => {
  expect(new Set(LAYERS.map((d) => d.id)).size).toBe(LAYERS.length);
  expect(LAYERS.map((d) => d.id).sort()).toEqual(Object.keys(useFreeplay.getState().layers).sort());
  for (const layer of LAYERS) expect(LAYER_CATEGORIES.some((c) => c.id === layer.category)).toBe(true);
});
