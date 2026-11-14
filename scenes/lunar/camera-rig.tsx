"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type CameraShot = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Optional aim for portrait viewports, so key sky elements stay in frame. */
  narrowTarget?: THREE.Vector3;
  fov: number;
  /** Amplitude of the slow drift, in scene units. */
  drift: number;
  /** Amplitude of pointer parallax, in scene units. */
  parallax: number;
};

/**
 * Slow cinematic drift plus gentle pointer parallax. Static when
 * `still` is true (reduced motion).
 */
export function CameraRig({ shot, still }: { shot: CameraShot; still: boolean }) {
  const get = useThree((s) => s.get);
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const target = narrow && shot.narrowTarget ? shot.narrowTarget : shot.target;
  const pointer = useRef(new THREE.Vector2());
  const eased = useRef(new THREE.Vector2());
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    camera.fov = shot.fov;
    camera.near = 0.5;
    camera.far = 3000;
    camera.position.copy(shot.position);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    get().invalidate();
  }, [get, shot, target]);

  // Track the pointer over the whole window so overlays don't block parallax.
  useEffect(() => {
    if (still) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [still]);

  useFrame((state, delta) => {
    if (still) return;
    const t = state.clock.elapsedTime;
    eased.current.lerp(pointer.current, 1 - Math.exp(-delta * 1.8));
    const p = tmp.current.copy(shot.position);
    p.x += Math.sin(t * 0.045) * shot.drift + eased.current.x * shot.parallax;
    p.y += Math.sin(t * 0.07) * shot.drift * 0.18 - eased.current.y * shot.parallax * 0.35;
    p.z += Math.cos(t * 0.045) * shot.drift * 0.4;
    state.camera.position.copy(p);
    state.camera.lookAt(target);
  });

  return null;
}
