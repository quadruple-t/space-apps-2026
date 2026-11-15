import * as THREE from "three";

/** Keep the point grabbed on the marker under the pointer, inside the loaded terrain. */
export function markerLocation(point: THREE.Vector3, offsetX: number, offsetZ: number, radiusM: number) {
  const limit = Math.max(0, radiusM - 1.5);
  return {
    eastM: THREE.MathUtils.clamp(point.x + offsetX, -limit, limit),
    northM: -THREE.MathUtils.clamp(point.z + offsetZ, -limit, limit),
  };
}

export function terrainUnderPointer(camera: THREE.Camera, mesh: THREE.Mesh, x: number, y: number, bounds: { left: number; top: number; width: number; height: number }, raycaster: THREE.Raycaster) {
  if (!bounds.width || !bounds.height) return null;
  raycaster.setFromCamera(new THREE.Vector2((x - bounds.left) / bounds.width * 2 - 1, -(y - bounds.top) / bounds.height * 2 + 1), camera);
  return raycaster.intersectObject(mesh, false)[0]?.point ?? null;
}
