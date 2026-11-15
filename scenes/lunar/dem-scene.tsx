"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { horizonDirection } from "@/data/hero-scene";
import { slopeAtLocal, sampleField, type DemGrid } from "@/lib/terrain/dem";
import type { Placement } from "@/lib/drive-placements";
import type { CameraMode } from "./camera-rig";
import { Earth, SKY_DISTANCE, Starfield, Sun } from "./celestial";
import { buildDemSurface, computeSunVisibility, createDemGeometry, fillColors, groundNormal, groundY, insideTile, patchSunVisibility, type DemSurface, type TerrainColorMode } from "./dem-terrain";
import { LunarRover } from "./rover";
import { Beacon, SURFACE_OBJECTS, SunShaded, SurfaceObjectModel, type SurfaceObjectType } from "./surface-objects";

/**
 * Surface drive over measured elevation (scene units are metres; see dem-terrain.ts).
 * The procedural LunarScene remains the fallback when no elevation grid is available.
 */

export type PlayerState = { eastM: number; northM: number; headingDeg: number };
export type PlacementCheck = { ok: boolean; reason: string | null; slopeDeg: number };

export type DemSceneProps = {
  grid: DemGrid;
  radiusM: number;
  exaggeration: number;
  colorMode: TerrainColorMode;
  detail: "high" | "low";
  active?: boolean;
  still?: boolean;
  cameraMode: CameraMode;
  zoom: number;
  lookSensitivity: number;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  earthAzimuthDeg: number;
  earthElevationDeg: number;
  placements: Placement[];
  buildType: SurfaceObjectType | null;
  buildHeadingDeg: number;
  onPlace: (eastM: number, northM: number) => void;
  /** Placement verdict under the cursor while building (null when off the terrain). */
  onHoverCheck?: (check: PlacementCheck | null) => void;
  onPlayer: (state: PlayerState) => void;
  onTutorialAction?: (action: "look" | "move") => void;
  /** Bumped by the HUD to send the buggy back to the site centre. */
  recenterKey: number;
};

const SUN_COLOR = "#fff3ea";
const BEACON_COLORS: Record<SurfaceObjectType, string> = { solar: "#4b9bff", rover: "#ff5364", dome: "#a986ff", modules: "#a986ff", inflatable: "#a986ff", comms: "#70d7ff" };
const toVec = (d: { x: number; y: number; z: number }) => new THREE.Vector3(d.x, d.y, d.z).normalize();

/** Placement rules shared by the ghost and the click handler. */
export function checkPlacement(grid: DemGrid, radiusM: number, placements: Placement[], type: SurfaceObjectType, eastM: number, northM: number): PlacementCheck {
  const spec = SURFACE_OBJECTS[type];
  const slopeDeg = slopeAtLocal(grid, eastM, northM);
  if (Math.hypot(eastM, northM) > radiusM - spec.footprintM) return { ok: false, reason: "Outside the loaded area", slopeDeg };
  if (slopeDeg > spec.maxSlopeDeg) return { ok: false, reason: `Slope ${slopeDeg.toFixed(1)}° exceeds ${spec.maxSlopeDeg}°`, slopeDeg };
  const clash = placements.find((p) => Math.hypot(p.eastM - eastM, p.northM - northM) < SURFACE_OBJECTS[p.type].footprintM + spec.footprintM);
  if (clash) return { ok: false, reason: `Overlaps ${SURFACE_OBJECTS[clash.type].short.toLowerCase()}`, slopeDeg };
  return { ok: true, reason: null, slopeDeg };
}

/** Sun, Earth and stars ride with the camera, far beyond any terrain, so ridges can hide them. */
function SkyAnchor({ radius, children }: { radius: number; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { group.current?.position.copy(camera.position); });
  return <group ref={group} scale={radius / SKY_DISTANCE}>{children}</group>;
}

function DemSunLight({ direction, playerRef, coverM, mapSize, shadowDirtyRef }: { direction: THREE.Vector3; playerRef: MutableRefObject<THREE.Vector3>; coverM: number; mapSize: number; shadowDirtyRef: MutableRefObject<boolean> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const centre = useRef(new THREE.Vector3(Infinity, 0, 0));
  const get = useThree((s) => s.get);
  useEffect(() => {
    get().gl.shadowMap.autoUpdate = false;
    if (light.current && target.current) light.current.target = target.current;
    shadowDirtyRef.current = true;
  }, [get, shadowDirtyRef]);
  useEffect(() => { shadowDirtyRef.current = true; centre.current.set(Infinity, 0, 0); }, [direction, coverM, shadowDirtyRef]);
  useFrame(() => {
    const l = light.current, t = target.current;
    if (!l || !t) return;
    if (centre.current.distanceTo(playerRef.current) > coverM * 0.2) {
      centre.current.copy(playerRef.current);
      t.position.copy(playerRef.current);
      l.position.copy(direction).multiplyScalar(coverM * 3).add(playerRef.current);
      t.updateMatrixWorld();
      shadowDirtyRef.current = true;
    }
    if (shadowDirtyRef.current) {
      get().gl.shadowMap.needsUpdate = true;
      shadowDirtyRef.current = false;
    }
  });
  return <>
    <object3D ref={target} />
    <directionalLight ref={light} color={SUN_COLOR} intensity={4.2} castShadow
      shadow-mapSize-width={mapSize} shadow-mapSize-height={mapSize}
      shadow-camera-left={-coverM} shadow-camera-right={coverM} shadow-camera-top={coverM} shadow-camera-bottom={-coverM}
      shadow-camera-near={1} shadow-camera-far={coverM * 6} shadow-bias={-0.0002} shadow-normalBias={coverM / mapSize * 1.5} />
  </>;
}

function DemTerrain({ surface, colorMode, sunDir, building, onVisibility, onPointer, onPick, onTeleport }: {
  surface: DemSurface; colorMode: TerrainColorMode; sunDir: THREE.Vector3; building: boolean;
  onVisibility: (field: Float32Array) => void;
  onPointer: (point: THREE.Vector3 | null) => void; onPick: (point: THREE.Vector3) => void; onTeleport: (point: THREE.Vector3) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => createDemGeometry(surface, "regolith"), [surface]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
    patchSunVisibility(m, "attribute");
    return m;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    fillColors(surface, colorMode, colors.array as Float32Array);
    colors.needsUpdate = true;
    invalidate();
  }, [geometry, surface, colorMode, invalidate]);

  // Terrain-blocked sunlight, recomputed as the Sun moves (throttled during fast playback).
  const lastRun = useRef(0);
  useEffect(() => {
    const attribute = geometry.getAttribute("sunVis") as THREE.BufferAttribute;
    const run = () => {
      lastRun.current = performance.now();
      computeSunVisibility(surface, sunDir, attribute.array as Float32Array, surface.size > 160 ? 2 : 1);
      attribute.needsUpdate = true;
      onVisibility(attribute.array as Float32Array);
      invalidate();
    };
    const wait = 90 - (performance.now() - lastRun.current);
    if (wait <= 0) { run(); return; }
    const timer = window.setTimeout(run, wait);
    return () => window.clearTimeout(timer);
  }, [geometry, surface, sunDir, onVisibility, invalidate]);

  // Terrain does not cast into the shadow map: terrain-on-terrain shadowing comes from the
  // per-vertex ray march (exact at grid resolution, whole tile); the map only carries hardware.
  return <mesh geometry={geometry} material={material} receiveShadow
    // Raycasting the full mesh is only worth it while placing objects.
    onPointerMove={building ? (e: ThreeEvent<PointerEvent>) => onPointer(e.point) : undefined}
    onPointerOut={building ? () => onPointer(null) : undefined}
    onClick={(e: ThreeEvent<MouseEvent>) => { if (e.button === 0) { e.stopPropagation(); onPick(e.point); } }}
    onDoubleClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onTeleport(e.point); }} />;
}

function RadiusRing({ surface, radiusM }: { surface: DemSurface; radiusM: number }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let k = 0; k < 256; k++) {
      const a = (k / 256) * Math.PI * 2;
      const x = Math.sin(a) * radiusM, z = -Math.cos(a) * radiusM;
      points.push(x, groundY(surface, x, z) + Math.max(1, radiusM * 0.0015), z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, [surface, radiusM]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineLoop geometry={geometry}><lineBasicMaterial color="#a986ff" transparent opacity={0.85} toneMapped={false} /></lineLoop>;
}

function FootprintRing({ radius, color }: { radius: number; color: string }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
    <ringGeometry args={[radius, radius + Math.max(0.25, radius * 0.08), 40]} />
    <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
  </mesh>;
}

type Sky = { sunAz: number; sunEl: number; earthAz: number; earthEl: number };

function PlacedObject({ placement, surface, vis, sky }: { placement: Placement; surface: DemSurface; vis: number; sky: Sky }) {
  const x = placement.eastM, z = -placement.northM;
  const y = groundY(surface, x, z);
  const quaternion = useMemo(() => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -placement.headingDeg * Math.PI / 180);
    if (placement.type !== "rover") return yaw;
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), groundNormal(surface, x, z)).multiply(yaw);
  }, [placement.type, placement.headingDeg, surface, x, z]);
  // Trackers point in absolute directions, so undo the object's own heading for them.
  const localSunAz = sky.sunAz - placement.headingDeg, localEarthAz = sky.earthAz - placement.headingDeg;
  return <group position={[x, y, z]} quaternion={quaternion}>
    <SunShaded vis={vis}>
      <SurfaceObjectModel type={placement.type} sunAzimuthDeg={localSunAz} sunElevationDeg={sky.sunEl} earthAzimuthDeg={localEarthAz} earthElevationDeg={sky.earthEl} />
    </SunShaded>
    <Beacon color={BEACON_COLORS[placement.type]} height={placement.type === "rover" ? 6 : 14} />
  </group>;
}

function DemRig({ grid, surface, radiusM, mode, zoom, lookSensitivity, still, building, playerRef, headingRef, recenterKey, shadowDirtyRef, onPlayer, onTutorialAction }: {
  grid: DemGrid; surface: DemSurface; radiusM: number; mode: CameraMode; zoom: number; lookSensitivity: number; still: boolean; building: boolean;
  playerRef: MutableRefObject<THREE.Vector3>; headingRef: MutableRefObject<number>; recenterKey: number; shadowDirtyRef: MutableRefObject<boolean>;
  onPlayer: (state: PlayerState) => void; onTutorialAction?: (action: "look" | "move") => void;
}) {
  const { gl, invalidate } = useThree();
  const pitch = useRef(-0.12);
  const orbitYaw = useRef(0.6);
  const orbitPitch = useRef(0.55);
  const distance = useRef(Math.min(900, Math.max(60, radiusM * 0.25)));
  const keys = useRef(new Set<string>());
  const last = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const rover = useRef<THREE.Group>(null);
  const lastReport = useRef(0);
  const desired = useRef(new THREE.Vector3());
  const focus = useRef(new THREE.Vector3());
  const normal = useRef(new THREE.Vector3());
  const yawQ = useRef(new THREE.Quaternion());
  const tiltQ = useRef(new THREE.Quaternion());

  // A new grid (site or radius) or the recentre button puts the buggy back at the site centre.
  useEffect(() => {
    playerRef.current.set(0, 0, 0);
    headingRef.current = 0;
    distance.current = Math.min(900, Math.max(60, grid.halfExtentM * 0.25));
    shadowDirtyRef.current = true;
    invalidate();
  }, [grid, recenterKey, playerRef, headingRef, shadowDirtyRef, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const motion = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
    const pressed = keys.current;
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.closest("[data-no-flight-controls]"))) return;
      const key = event.key.toLowerCase();
      if (!motion.has(key)) return;
      if (key !== "shift") { event.preventDefault(); onTutorialAction?.("move"); }
      pressed.add(key);
      invalidate();
    };
    const keyUp = (event: KeyboardEvent) => { pressed.delete(event.key.toLowerCase()); invalidate(); };
    const blur = () => pressed.clear();
    const look = (dx: number, dy: number) => {
      const s = lookSensitivity;
      if (mode === "first-person") {
        headingRef.current += dx * 0.004 * s;
        pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.003 * s, -1.1, 0.9);
      } else {
        orbitYaw.current -= dx * 0.005 * s;
        orbitPitch.current = THREE.MathUtils.clamp(orbitPitch.current + dy * 0.004 * s, 0.08, 1.45);
      }
      if (Math.abs(dx) + Math.abs(dy) > 0) onTutorialAction?.("look");
      invalidate();
    };
    const down = (event: PointerEvent) => {
      // While building, the left button places objects, so looking needs the right button (or touch drag).
      const lookButton = event.pointerType === "touch" ? event.button === 0 : building ? event.button === 2 : false;
      last.current = { x: event.clientX, y: event.clientY };
      if (lookButton) { dragging.current = true; el.setPointerCapture(event.pointerId); }
    };
    const move = (event: PointerEvent) => {
      const dx = event.clientX - last.current.x, dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      const hoverLook = event.pointerType !== "touch" && !building;
      if (hoverLook || dragging.current) look(dx, dy);
    };
    const up = () => { dragging.current = false; };
    const enter = (event: PointerEvent) => { last.current = { x: event.clientX, y: event.clientY }; };
    const menu = (event: MouseEvent) => { if (building) event.preventDefault(); };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      distance.current = THREE.MathUtils.clamp(distance.current * Math.exp(event.deltaY * 0.0012), 8, Math.max(600, radiusM * 2.6));
      invalidate();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("contextmenu", menu);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("wheel", wheel);
      pressed.clear();
    };
  }, [gl, mode, building, lookSensitivity, radiusM, headingRef, invalidate, onTutorialAction]);

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const p = playerRef.current;
    const k = keys.current;
    let forward = 0, strafe = 0;
    if (k.has("w") || k.has("arrowup")) forward += 1;
    if (k.has("s") || k.has("arrowdown")) forward -= 1;
    if (k.has("a") || k.has("arrowleft")) strafe -= 1;
    if (k.has("d") || k.has("arrowright")) strafe += 1;
    const moving = forward !== 0 || strafe !== 0;
    if (moving) {
      const m = Math.hypot(forward, strafe);
      // Real buggy speed is ~4 m/s; this is quicker so larger areas stay explorable. Shift boosts.
      const speed = (k.has("shift") ? 60 : 12) * Math.max(1, radiusM / 20_000);
      const step = Math.min(delta, 0.05) * speed;
      const facing = mode === "first-person" ? headingRef.current : mode === "orbit" ? -orbitYaw.current : 0;
      if (mode !== "first-person" && strafe === 0) headingRef.current = facing;
      const x = p.x + (Math.sin(facing) * forward + Math.cos(facing) * strafe) / m * step;
      const z = p.z + (-Math.cos(facing) * forward + Math.sin(facing) * strafe) / m * step;
      const r = Math.hypot(x, z), limit = radiusM * 0.98;
      p.x = r > limit ? x * limit / r : x;
      p.z = r > limit ? z * limit / r : z;
      shadowDirtyRef.current = true;
    }
    p.y = groundY(surface, p.x, p.z);

    if (rover.current) {
      rover.current.position.set(p.x, p.y, p.z);
      yawQ.current.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI - headingRef.current);
      tiltQ.current.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, groundNormal(surface, p.x, p.z, normal.current));
      rover.current.quaternion.copy(tiltQ.current).multiply(yawQ.current);
    }

    const far = Math.max(8000, radiusM * 3.2);
    if (camera.far !== far) { camera.far = far; camera.near = 0.25; camera.updateProjectionMatrix(); }
    if (mode === "first-person") {
      const fov = THREE.MathUtils.clamp(60 * zoom, 28, 90);
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const h = headingRef.current;
      // Chase view: behind and above the buggy, never below the ground under the camera.
      const cx = p.x - Math.sin(h) * 9, cz = p.z + Math.cos(h) * 9;
      const cy = Math.max(p.y + 3.4, groundY(surface, cx, cz) + 1.6);
      camera.position.set(cx, cy, cz);
      focus.current.set(p.x + Math.sin(h) * Math.cos(pitch.current) * 60, p.y + 2 + Math.sin(pitch.current) * 60, p.z - Math.cos(h) * Math.cos(pitch.current) * 60);
      camera.up.set(0, 1, 0);
      camera.lookAt(focus.current);
    } else {
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
      const d = distance.current * zoom;
      focus.current.set(p.x, p.y + 1.5, p.z);
      if (mode === "overhead") desired.current.set(p.x, p.y + d, p.z + 0.001);
      else desired.current.set(
        p.x + Math.sin(orbitYaw.current) * Math.cos(orbitPitch.current) * d,
        p.y + Math.sin(orbitPitch.current) * d,
        p.z + Math.cos(orbitYaw.current) * Math.cos(orbitPitch.current) * d,
      );
      desired.current.y = Math.max(desired.current.y, groundY(surface, desired.current.x, desired.current.z) + 2);
      if (still) camera.position.copy(desired.current);
      else camera.position.lerp(desired.current, 1 - Math.exp(-delta * 5));
      camera.up.set(0, mode === "overhead" ? 0 : 1, mode === "overhead" ? -1 : 0);
      camera.lookAt(focus.current);
    }
    if (moving) invalidate();
    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.2) {
      lastReport.current = now;
      onPlayer({ eastM: p.x, northM: -p.z, headingDeg: ((headingRef.current * 180 / Math.PI) % 360 + 360) % 360 });
    }
  });

  return <group ref={rover}><LunarRover /></group>;
}

function SceneContents(props: DemSceneProps) {
  const { grid, radiusM, exaggeration, colorMode, detail, still = false, cameraMode, zoom, lookSensitivity, sunAzimuthDeg, sunElevationDeg, earthAzimuthDeg, earthElevationDeg, placements, buildType, buildHeadingDeg, onPlace, onHoverCheck, onPlayer, onTutorialAction, recenterKey } = props;
  const surface = useMemo(() => buildDemSurface(grid, exaggeration), [grid, exaggeration]);
  const sunDir = useMemo(() => toVec(horizonDirection(sunAzimuthDeg, sunElevationDeg)), [sunAzimuthDeg, sunElevationDeg]);
  const earthDir = useMemo(() => toVec(horizonDirection(earthAzimuthDeg, earthElevationDeg)), [earthAzimuthDeg, earthElevationDeg]);
  const player = useRef(new THREE.Vector3());
  const heading = useRef(0);
  const shadowDirty = useRef(true);
  // The terrain's sun-visibility field is mutated in place, so a counter forces object updates.
  const [vis, setVis] = useState<{ field: Float32Array | null; version: number }>({ field: null, version: 0 });
  const onVisibility = useCallback((field: Float32Array) => setVis((v) => ({ field, version: v.version + 1 })), []);
  const [hover, setHover] = useState<THREE.Vector3 | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const far = Math.max(8000, radiusM * 3.2);
  const sky: Sky = { sunAz: sunAzimuthDeg, sunEl: sunElevationDeg, earthAz: earthAzimuthDeg, earthEl: earthElevationDeg };

  const visAt = (x: number, z: number) => {
    const field = vis.field;
    if (!field || field.length !== surface.size * surface.size) return 1;
    return sampleField(field, surface.size, (x + surface.half) / surface.spacing, (z + surface.half) / surface.spacing);
  };
  useEffect(() => { shadowDirty.current = true; }, [placements, hover, buildType, buildHeadingDeg]);

  const ghost = buildType && hover && insideTile(surface, hover.x, hover.z) ? (() => {
    const check = checkPlacement(grid, radiusM, placements, buildType, hover.x, -hover.z);
    return { check, x: hover.x, z: hover.z, y: groundY(surface, hover.x, hover.z) };
  })() : null;

  const ghostOk = ghost?.check.ok ?? null, ghostReason = ghost?.check.reason ?? null, ghostSlope = ghost ? Math.round(ghost.check.slopeDeg * 10) / 10 : null;
  useEffect(() => {
    onHoverCheck?.(ghostOk === null ? null : { ok: ghostOk, reason: ghostReason, slopeDeg: ghostSlope ?? 0 });
  }, [ghostOk, ghostReason, ghostSlope, onHoverCheck]);

  return <>
    <color attach="background" args={["#05040b"]} />
    {/* Earthshine fill: faint and blue so shadowed ground is not pure black. */}
    <hemisphereLight args={["#7d8fd8", "#0b0a16", 0.22]} />
    <ambientLight intensity={0.03} />
    <DemSunLight direction={sunDir} playerRef={player} coverM={Math.min(radiusM, detail === "high" ? 450 : 300)} mapSize={detail === "high" ? 2048 : 1024} shadowDirtyRef={shadowDirty} />
    <DemTerrain surface={surface} colorMode={colorMode} sunDir={sunDir} building={!!buildType} onVisibility={onVisibility}
      onPointer={(point) => { if (buildType) { setHover(point ? point.clone() : null); invalidate(); } }}
      onPick={(point) => {
        if (!buildType) return;
        if (checkPlacement(grid, radiusM, placements, buildType, point.x, -point.z).ok) onPlace(point.x, -point.z);
      }}
      onTeleport={(point) => {
        if (cameraMode === "first-person" || Math.hypot(point.x, point.z) > radiusM * 0.98) return;
        player.current.set(point.x, groundY(surface, point.x, point.z), point.z);
        shadowDirty.current = true;
        invalidate();
      }} />
    <RadiusRing surface={surface} radiusM={radiusM} />
    {placements.map((placement) => <PlacedObject key={placement.id} placement={placement} surface={surface} vis={visAt(placement.eastM, -placement.northM)} sky={sky} />)}
    {ghost && buildType && <group position={[ghost.x, ghost.y, ghost.z]} rotation={[0, -buildHeadingDeg * Math.PI / 180, 0]}>
      <SunShaded vis={visAt(ghost.x, ghost.z)}>
        <SurfaceObjectModel type={buildType} sunAzimuthDeg={sky.sunAz - buildHeadingDeg} sunElevationDeg={sky.sunEl} earthAzimuthDeg={sky.earthAz - buildHeadingDeg} earthElevationDeg={sky.earthEl} />
      </SunShaded>
      <FootprintRing radius={SURFACE_OBJECTS[buildType].footprintM} color={ghost.check.ok ? "#7be0a0" : "#ff5364"} />
    </group>}
    <DemRig grid={grid} surface={surface} radiusM={radiusM} mode={cameraMode} zoom={zoom} lookSensitivity={lookSensitivity} still={still} building={!!buildType}
      playerRef={player} headingRef={heading} recenterKey={recenterKey} shadowDirtyRef={shadowDirty} onPlayer={onPlayer} onTutorialAction={onTutorialAction} />
    <SkyAnchor radius={far * 0.6}>
      <Starfield count={detail === "high" ? 1400 : 800} />
      <Sun direction={sunDir} />
      <Earth direction={earthDir} sunDirection={sunDir} />
    </SkyAnchor>
  </>;
}

export default function DemScene(props: DemSceneProps) {
  const { active = true, still = false, detail } = props;
  return <Canvas
    shadows="percentage"
    dpr={[1, detail === "high" ? 1.75 : 1.25]}
    frameloop={active && !still ? "always" : "demand"}
    gl={{ antialias: true, powerPreference: "high-performance", alpha: false, logarithmicDepthBuffer: true }}
    camera={{ fov: 60, near: 0.25, far: 20_000, position: [0, 50, 50] }}
    onCreated={({ gl }) => { gl.domElement.style.touchAction = "none"; }}
    aria-hidden
    tabIndex={-1}
  >
    <SceneContents {...props} />
  </Canvas>;
}
