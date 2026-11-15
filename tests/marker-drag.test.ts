import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { markerLocation, terrainUnderPointer } from "@/lib/marker-drag";

describe("current-location marker dragging", () => {
  const bounds = { left: 100, top: 40, width: 800, height: 600 };
  it("maps the pointer onto sloped terrain rather than a flat height plane", () => {
    const geometry = new THREE.PlaneGeometry(1000, 1000);
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) vertices.setZ(i, vertices.getX(i) * 0.2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(55, bounds.width / bounds.height, 0.1, 2000);
    camera.position.set(0, 100, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const target = new THREE.Vector3(20, 4, -40);
    const projected = target.clone().project(camera);
    const hit = terrainUnderPointer(camera, mesh, bounds.left + (projected.x + 1) * bounds.width / 2,
      bounds.top + (1 - projected.y) * bounds.height / 2, bounds, new THREE.Raycaster());
    expect(hit?.x).toBeCloseTo(target.x);
    expect(hit?.y).toBeCloseTo(target.y);
    expect(hit?.z).toBeCloseTo(target.z);
    geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });
  it("preserves the grab offset and converts scene Z into north-positive coordinates", () => {
    expect(markerLocation(new THREE.Vector3(100, 20, -30), 5, -7, 1000)).toEqual({ eastM: 105, northM: 37 });
  });
  it("keeps the location inside the loaded terrain border", () => {
    expect(markerLocation(new THREE.Vector3(1200, 0, -1500), 0, 0, 1000)).toEqual({ eastM: 998.5, northM: 998.5 });
    expect(markerLocation(new THREE.Vector3(-1200, 0, 1500), 0, 0, 1000)).toEqual({ eastM: -998.5, northM: -998.5 });
  });
});
