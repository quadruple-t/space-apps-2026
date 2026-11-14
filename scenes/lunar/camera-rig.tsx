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

export type CameraMode = "first-person" | "orbit" | "overhead";

/**
 * Slow cinematic drift plus gentle pointer parallax. Static when
 * `still` is true (reduced motion).
 */
export function CameraRig({ shot, still, mode = "first-person", interactive = false, zoom = 1, orbitTarget }: { shot: CameraShot; still: boolean; mode?: CameraMode; interactive?: boolean; zoom?: number; orbitTarget?: THREE.Vector3 }) {
  const { get, gl } = useThree();
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const target = narrow && shot.narrowTarget ? shot.narrowTarget : shot.target;
  const pointer = useRef(new THREE.Vector2());
  const eased = useRef(new THREE.Vector2());
  const tmp = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0.04);
  const distance = useRef(250);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const elapsed = useRef(0);
  const didInitialize = useRef(false);

  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    const resetToShot = !didInitialize.current || !interactive;
    camera.fov = shot.fov;
    camera.near = 0.5;
    camera.far = 3000;
    if (resetToShot) {
      camera.position.copy(shot.position);
      camera.lookAt(target);
    }
    camera.updateProjectionMatrix();
    get().invalidate();
    didInitialize.current = true;
    yaw.current = 0;
    pitch.current = 0.04;
  }, [get, shot, target, interactive]);

  useEffect(() => {
    yaw.current = mode === "first-person" ? 0.35 : 0;
    pitch.current = mode === "orbit" ? 0.28 : mode === "first-person" ? 0.2 : 0.04;
  }, [mode]);

  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging.current = true;
      last.current = { x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      yaw.current -= dx * 0.004;
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.003, -1.1, 1.1);
    };
    const up = () => { dragging.current = false; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      distance.current = THREE.MathUtils.clamp(distance.current + event.deltaY * 0.18, 85, 520);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, interactive]);

  // Track the pointer over the whole window so overlays don't block parallax.
  useEffect(() => {
    if (still && !interactive) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [still, interactive]);

  useFrame((state, delta) => {
    if (still && !interactive) return;
    elapsed.current += delta;
    if (interactive) {
      const camera = state.camera as THREE.PerspectiveCamera;
      const focus = orbitTarget ?? new THREE.Vector3(0, 0, -95);
      if (mode === "first-person") {
        const nextFov = THREE.MathUtils.clamp(55 * zoom, 28, 88);
        if (camera.fov !== nextFov) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }
      } else if (camera.fov !== 55) {
        camera.fov = 55;
        camera.updateProjectionMatrix();
      }
      const desiredDistance = mode === "first-person" ? 0 : mode === "overhead" ? Math.min(distance.current, 400) : distance.current;
      const effectiveDistance = desiredDistance * zoom;
      const desired = mode === "first-person"
        ? shot.position.clone().add(new THREE.Vector3(Math.sin(yaw.current) * 3, 0, Math.cos(yaw.current) * 3))
        : new THREE.Vector3(
            focus.x + Math.sin(yaw.current) * Math.cos(pitch.current) * effectiveDistance,
            focus.y + (mode === "overhead" ? effectiveDistance : Math.sin(pitch.current) * effectiveDistance),
            focus.z + Math.cos(yaw.current) * Math.cos(pitch.current) * effectiveDistance,
          );
      camera.position.lerp(desired, 1 - Math.exp(-delta * 3));
      if (mode === "overhead") camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
      const firstPersonAim = camera.position.clone().add(new THREE.Vector3(
        Math.sin(yaw.current) * Math.cos(pitch.current),
        Math.sin(pitch.current),
        -Math.cos(yaw.current) * Math.cos(pitch.current),
      ).multiplyScalar(500));
      camera.lookAt(mode === "first-person" ? firstPersonAim : focus);
      return;
    }
    const t = elapsed.current;
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
