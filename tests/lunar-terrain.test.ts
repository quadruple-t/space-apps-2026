import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTerrainBoundaryGeometry, terrainProfileForSite } from "@/scenes/lunar/terrain";

describe("procedural lunar terrain boundary", () => {
  it("creates a closed perimeter wall with visible vertical depth", () => {
    const { wall, edge } = createTerrainBoundaryGeometry("low", terrainProfileForSite({ id: "connecting-ridge" }));
    const size = wall.boundingBox!.getSize(new THREE.Vector3());

    expect(wall.getAttribute("position").count).toBeGreaterThan(300);
    expect(edge.getAttribute("position").count).toBeGreaterThan(300);
    expect(size.x).toBeGreaterThan(2_000);
    expect(size.y).toBeGreaterThan(70);
    expect(size.z).toBeGreaterThan(800);

    wall.dispose();
    edge.dispose();
  });
});