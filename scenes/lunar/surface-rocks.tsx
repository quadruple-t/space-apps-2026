"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sampleField } from "@/lib/terrain/dem";
import type { Placement } from "@/lib/drive-placements";
import { groundNormal, groundY, insideTile, patchSunVisibility, type DemSurface } from "./dem-terrain";
import { cellHash, ROCK_FIELD_HIGH, ROCK_FIELD_LOW, ROCK_VARIANTS, scatterRocks, type Rock } from "./rock-field";
import { SURFACE_OBJECTS } from "./surface-objects";

/**
 * Instanced decorative rocks around the first-person viewer (see rock-field.ts). Visual only: they
 * are not raycast, never enter the DEM grid and so never affect horizon, sunlight or hardware analysis.
 * Rocks are regenerated only when the viewer has moved about 1.5 scatter cells, and pick up the
 * terrain's ray-marched sunlight per instance so they darken inside terrain shadow like the ground.
 */

const noRaycast = () => {};

/** Low-poly rock: an icosahedron with deterministic per-vertex jitter (kept watertight) and flat facets. */
function rockGeometry(variant: number, capacity: number) {
  const g = new THREE.IcosahedronGeometry(1, variant === 2 ? 1 : 0);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k);
    // Jitter is keyed on the original vertex position so shared corners move together.
    const key = (a: number) => Math.round(a * 1000);
    const r = 0.72 + cellHash(key(v.x) + variant * 7919, key(v.y), key(v.z)) * 0.5;
    v.multiplyScalar(r);
    // Flatter underside so rocks seat into the soil.
    if (v.y < 0) v.y *= 0.55;
    pos.setXYZ(k, v.x, v.y, v.z);
  }
  g.deleteAttribute("normal");
  g.computeVertexNormals();
  g.setAttribute("sunVis", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
  return g;
}

export function SurfaceRocks({ surface, detail, focusRef, shadowDirtyRef, visField, visVersion, placements }: {
  surface: DemSurface;
  detail: "high" | "low";
  focusRef: MutableRefObject<THREE.Vector3>;
  shadowDirtyRef: MutableRefObject<boolean>;
  /** Terrain sun-visibility field (per grid sample), or null when not computed yet. */
  visField: Float32Array | null;
  visVersion: number;
  placements: Placement[];
}) {
  const invalidate = useThree((s) => s.invalidate);
  const options = detail === "high" ? ROCK_FIELD_HIGH : ROCK_FIELD_LOW;
  const castShadow = detail === "high";

  const { meshes, material } = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0, flatShading: true });
    patchSunVisibility(m, "attribute");
    const list = Array.from({ length: ROCK_VARIANTS }, (_, variant) => {
      const mesh = new THREE.InstancedMesh(rockGeometry(variant, options.maxRocks), m, options.maxRocks);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      // Instances move with the viewer, so a fixed bounding sphere would cull them wrongly.
      mesh.frustumCulled = false;
      mesh.raycast = noRaycast;
      mesh.receiveShadow = true;
      return mesh;
    });
    return { meshes: list, material: m };
  }, [options.maxRocks]);
  useEffect(() => () => {
    meshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.dispose(); });
    material.dispose();
  }, [meshes, material]);
  useEffect(() => { meshes.forEach((mesh) => { mesh.castShadow = castShadow; }); }, [meshes, castShadow]);

  const rocks = useRef<Rock[]>([]);
  const builtAt = useRef(new THREE.Vector3(Infinity, 0, 0));
  const dirty = useRef(true);
  // New terrain, lighting or hardware: regenerate on the next frame.
  useEffect(() => { dirty.current = true; invalidate(); }, [surface, visField, visVersion, placements, meshes, invalidate]);

  useFrame(() => {
    const f = focusRef.current;
    if (!dirty.current && Math.hypot(f.x - builtAt.current.x, f.z - builtAt.current.z) < options.cellM * 1.5) return;
    dirty.current = false;
    builtAt.current.copy(f);
    const clear = placements.map((p) => ({ x: p.eastM, z: -p.northM, r: SURFACE_OBJECTS[p.type].footprintM + 0.5 }));
    const n = scatterRocks(f.x, f.z, options, rocks.current, (x, z, r) =>
      insideTile(surface, x, z, r + 0.5) && !clear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r));
    const field = visField && visField.length === surface.size * surface.size ? visField : null;
    const counts = new Array<number>(ROCK_VARIANTS).fill(0);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const normal = new THREE.Vector3(), color = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const rock = rocks.current[k];
      const mesh = meshes[rock.variant];
      const slot = counts[rock.variant]++;
      groundNormal(surface, rock.x, rock.z, normal);
      const slopeTan = Math.hypot(normal.x, normal.z) / Math.max(0.2, normal.y);
      const height = rock.radius * rock.squash;
      // Sink a third of the height, plus enough that the downhill edge does not float on slopes.
      const y = groundY(surface, rock.x, rock.z) - height * 0.35 - rock.radius * rock.stretch * slopeTan;
      p.set(rock.x, y, rock.z);
      q.setFromEuler(e.set(rock.tiltX, rock.yaw, rock.tiltZ));
      s.set(rock.radius * rock.stretch, height, rock.radius);
      mesh.setMatrixAt(slot, matrix.compose(p, q, s));
      mesh.setColorAt(slot, color.setScalar(rock.shade));
      const vis = field ? sampleField(field, surface.size, (rock.x + surface.half) / surface.spacing, (rock.z + surface.half) / surface.spacing) : 1;
      (mesh.geometry.getAttribute("sunVis") as THREE.InstancedBufferAttribute).setX(slot, vis);
    }
    meshes.forEach((mesh, variant) => {
      mesh.count = counts[variant];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute("sunVis").needsUpdate = true;
    });
    if (castShadow) shadowDirtyRef.current = true;
  });

  return <group>{meshes.map((mesh, k) => <primitive key={k} object={mesh} />)}</group>;
}
