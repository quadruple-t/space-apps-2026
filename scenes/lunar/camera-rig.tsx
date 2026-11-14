"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LunarRover } from "./rover";
import { heightAt } from "./terrain";

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
export type MoveCommand = "forward" | "back" | "left" | "right" | null;

/**
 * Slow cinematic drift plus gentle pointer parallax. Static when
 * `still` is true (reduced motion).
 */
export function CameraRig({ shot, still, mode = "first-person", interactive = false, zoom = 1, orbitTarget, moveCommand = null, landingActive = false }: { shot: CameraShot; still: boolean; mode?: CameraMode; interactive?: boolean; zoom?: number; orbitTarget?: THREE.Vector3; moveCommand?: MoveCommand; landingActive?: boolean }) {
  const { get, gl } = useThree();
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const target = narrow && shot.narrowTarget ? shot.narrowTarget : shot.target;
  const pointer = useRef(new THREE.Vector2());
  const eased = useRef(new THREE.Vector2());
  const tmp = useRef(new THREE.Vector3());
  const focusFallback = useRef(new THREE.Vector3(0, 0, -95));
  const desired = useRef(new THREE.Vector3());
  const aim = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0.04);
  const distance = useRef(250);
  const dragging = useRef(false);
  const keys = useRef(new Set<string>());
  const keyFrame = useRef<number | null>(null);
  const playerPosition = useRef(new THREE.Vector3());
  const spawnPosition = useRef(new THREE.Vector3());
  const roverRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Mesh>(null);
  const dustMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const landingProgress = useRef(1);
  const lastSpawnShot = useRef<CameraShot | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const elapsed = useRef(0);
  const didInitialize = useRef(false);

  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    const resetToShot = !didInitialize.current || !interactive || lastSpawnShot.current !== shot;
    camera.fov = shot.fov;
    camera.near = 0.5;
    camera.far = 3000;
    if (resetToShot) {
      camera.position.copy(shot.position);
      playerPosition.current.set(shot.position.x, heightAt(shot.position.x, shot.position.z), shot.position.z);
      spawnPosition.current.copy(playerPosition.current);
      camera.lookAt(target);
    }
    camera.updateProjectionMatrix();
    get().invalidate();
    didInitialize.current = true;
    lastSpawnShot.current = shot;
    yaw.current = 0;
    pitch.current = 0.04;
  }, [get, shot, target, interactive]);

  useEffect(() => {
    if (landingActive) landingProgress.current = 0;
  }, [landingActive]);

  useEffect(() => {
    yaw.current = mode === "first-person" ? 0.35 : 0;
    pitch.current = mode === "orbit" ? 0.28 : mode === "first-person" ? 0.2 : 0.04;
  }, [mode]);

  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    const pressedKeys = keys.current;
    const motionKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const animateKeys = () => {
      if (keys.current.size === 0) { keyFrame.current = null; return; }
      get().invalidate();
      keyFrame.current = window.requestAnimationFrame(animateKeys);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.closest("[data-no-flight-controls]"))) return;
      const key = event.key.toLowerCase();
      if (!motionKeys.has(key)) return;
      event.preventDefault();
      keys.current.add(key);
      if (keyFrame.current === null) keyFrame.current = window.requestAnimationFrame(animateKeys);
      get().invalidate();
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
      get().invalidate();
      if (keys.current.size === 0 && keyFrame.current !== null) {
        window.cancelAnimationFrame(keyFrame.current);
        keyFrame.current = null;
      }
    };
    const elDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging.current = true;
      last.current = { x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
      get().invalidate();
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      yaw.current -= dx * 0.004;
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.003, -1.1, 1.1);
      get().invalidate();
    };
    const up = () => { dragging.current = false; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      distance.current = THREE.MathUtils.clamp(distance.current + event.deltaY * 0.18, 85, 520);
      get().invalidate();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    el.addEventListener("pointerdown", elDown);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      pressedKeys.clear();
      if (keyFrame.current !== null) window.cancelAnimationFrame(keyFrame.current);
      keyFrame.current = null;
      el.removeEventListener("pointerdown", elDown);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [get, gl, interactive]);

  useEffect(() => {
    if (!interactive || !moveCommand) return;
    let frame = 0;
    const tick = () => { get().invalidate(); frame = window.requestAnimationFrame(tick); };
    tick();
    return () => window.cancelAnimationFrame(frame);
  }, [get, interactive, moveCommand]);

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
      const player = playerPosition.current;
      const heading = yaw.current;
      if (mode === "first-person") {
        let forward = 0;
        let strafe = 0;
        if (keys.current.has("w") || keys.current.has("arrowup") || moveCommand === "forward") forward += 1;
        if (keys.current.has("s") || keys.current.has("arrowdown") || moveCommand === "back") forward -= 1;
        if (keys.current.has("a") || keys.current.has("arrowleft") || moveCommand === "left") strafe -= 1;
        if (keys.current.has("d") || keys.current.has("arrowright") || moveCommand === "right") strafe += 1;
        if (forward !== 0 || strafe !== 0) {
          const magnitude = Math.hypot(forward, strafe);
          forward /= magnitude;
          strafe /= magnitude;
          const distance = Math.min(delta, 0.05) * 18;
          const x = player.x + (Math.sin(heading) * forward + Math.cos(heading) * strafe) * distance;
          const z = player.z + (-Math.cos(heading) * forward + Math.sin(heading) * strafe) * distance;
          player.x = THREE.MathUtils.clamp(x, spawnPosition.current.x - 90, spawnPosition.current.x + 90);
          player.z = THREE.MathUtils.clamp(z, Math.max(-695, spawnPosition.current.z - 90), Math.min(-5, spawnPosition.current.z + 90));
          player.y = heightAt(player.x, player.z);
        }
        const roverX = player.x + Math.sin(heading) * 10 + Math.cos(heading) * 4;
        const roverZ = player.z - Math.cos(heading) * 10 + Math.sin(heading) * 4;
        const roverGround = heightAt(roverX, roverZ) + 0.72;
        if (landingActive && landingProgress.current < 1) landingProgress.current = Math.min(1, landingProgress.current + delta / 1.05);
        const landingEase = 1 - Math.pow(1 - landingProgress.current, 3);
        if (roverRef.current) {
          roverRef.current.position.set(roverX, roverGround + (landingActive ? 34 * (1 - landingEase) : 0), roverZ);
          roverRef.current.rotation.y = Math.PI - heading;
        }
        if (dustRef.current && dustMaterialRef.current) {
          dustRef.current.position.set(roverX, heightAt(roverX, roverZ) + 0.2, roverZ);
          const dustPulse = landingActive ? Math.max(0, 1 - Math.abs(landingProgress.current - 0.72) / 0.28) : 0;
          dustRef.current.scale.setScalar(1 + landingProgress.current * 2.4);
          dustMaterialRef.current.opacity = dustPulse * 0.35;
        }
      }
      const focus = orbitTarget ?? focusFallback.current;
      if (mode === "first-person") {
        const nextFov = THREE.MathUtils.clamp(55 * zoom, 28, 88);
        if (camera.fov !== nextFov) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
        camera.position.set(player.x, player.y + 6.5, player.z);
        aim.current.set(player.x + Math.sin(heading) * Math.cos(pitch.current) * 500, player.y + 6.5 + Math.sin(pitch.current) * 500, player.z - Math.cos(heading) * Math.cos(pitch.current) * 500);
        camera.up.set(0, 1, 0);
        camera.lookAt(aim.current);
      } else {
        if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
        const desiredDistance = mode === "overhead" ? Math.min(distance.current, 400) : distance.current;
        const effectiveDistance = desiredDistance * zoom;
        desired.current.set(
          focus.x + Math.sin(yaw.current) * Math.cos(pitch.current) * effectiveDistance,
          focus.y + (mode === "overhead" ? effectiveDistance : Math.sin(pitch.current) * effectiveDistance),
          focus.z + Math.cos(yaw.current) * Math.cos(pitch.current) * effectiveDistance,
        );
        if (still) camera.position.copy(desired.current);
        else camera.position.lerp(desired.current, 1 - Math.exp(-delta * 3));
        camera.up.set(0, mode === "overhead" ? 0 : 1, mode === "overhead" ? -1 : 0);
        camera.lookAt(focus);
      }
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

  return interactive ? <>
    <group ref={roverRef}><LunarRover /></group>
    <mesh ref={dustRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[3.2, 4.2, 28]} />
      <meshBasicMaterial ref={dustMaterialRef} color="#c5b9e8" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </> : null;
}
