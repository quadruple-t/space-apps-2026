"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { horizonDirection } from "@/data/hero-scene";
import { markerLocation, terrainUnderPointer } from "@/lib/marker-drag";
import { keyBelongsToControl } from "@/lib/keyboard";
import { sampleField, type DemGrid } from "@/lib/terrain/dem";
import { checkPlacement, type PlacementCheck } from "@/lib/terrain/placement-check";
import type { Placement } from "@/lib/drive-placements";
import { Earth, SKY_DISTANCE, Starfield, Sun } from "./celestial";
import { buildDemSurface, createRegolithDetailTexture, createRegolithNormalTexture, computeSunVisibility, createDemGeometry, fillColors, groundNormal, groundY, insideTile, patchSunVisibility, type DemSurface, type TerrainColorMode } from "./dem-terrain";
import { Beacon, SURFACE_OBJECTS, SunShaded, SurfaceObjectModel, type SurfaceObjectType } from "./surface-objects";
import { SurfaceRocks } from "./surface-rocks";

/**
 * Surface planner over measured elevation (scene units are metres; see dem-terrain.ts).
 * One orbit camera looks down on the tile: drag rotates, right-drag / WASD pans a little, the wheel zooms.
 * The tile is enclosed by border walls. The procedural LunarScene remains the fallback when no
 * elevation grid is available.
 */

/** Ground point the camera orbits, in metres east/north of the site centre. Telemetry is read here. */
export type FocusState = { eastM: number; northM: number };
export { checkPlacement, type PlacementCheck };

export type DemSceneProps = {
  grid: DemGrid;
  radiusM: number;
  exaggeration: number;
  colorMode: TerrainColorMode;
  detail: "high" | "low";
  active?: boolean;
  still?: boolean;
  zoom: number;
  lookSensitivity: number;
  viewMode: ViewMode;
  /** Moves the camera to look at a placed object when its key changes. */
  viewTarget: ViewTarget | null;
  /** Placed object the user clicked, and callbacks for clicking (select) and double-clicking (go to) one. */
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onViewObject: (id: string) => void;
  /** Light the landscape evenly (ignoring the Sun) so it is easy to see; false shows true Sun lighting and shadows. */
  autoLight: boolean;
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
  onFocus: (state: FocusState) => void;
  onTutorialAction?: (action: "look" | "move") => void;
  /** Bumped by the HUD to reset the view to the site centre. */
  recenterKey: number;
};

const SUN_COLOR = "#fff3ea";
const BEACON_COLORS: Record<SurfaceObjectType, string> = { solar: "#4b9bff", rover: "#ff5364", dome: "#a986ff", modules: "#a986ff", inflatable: "#a986ff", comms: "#70d7ff" };
const toVec = (d: { x: number; y: number; z: number }) => new THREE.Vector3(d.x, d.y, d.z).normalize();
/** Fixed high light used while the scene is auto-illuminated; relief still reads, nothing is in darkness. */
const AUTO_LIGHT_DIR = toVec(horizonDirection(135, 55));

/** Sun, Earth and stars ride with the camera, far beyond any terrain, so ridges can hide them. */
function SkyAnchor({ radius, children }: { radius: number; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { group.current?.position.copy(camera.position); });
  return <group ref={group} scale={radius / SKY_DISTANCE}>{children}</group>;
}

function DemSunLight({ direction, intensity, focusRef, coverM, mapSize, shadowDirtyRef }: { direction: THREE.Vector3; intensity: number; focusRef: MutableRefObject<THREE.Vector3>; coverM: number; mapSize: number; shadowDirtyRef: MutableRefObject<boolean> }) {
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
    if (centre.current.distanceTo(focusRef.current) > coverM * 0.2) {
      centre.current.copy(focusRef.current);
      t.position.copy(focusRef.current);
      l.position.copy(direction).multiplyScalar(coverM * 3).add(focusRef.current);
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
    <directionalLight ref={light} color={SUN_COLOR} intensity={intensity} castShadow
      shadow-mapSize-width={mapSize} shadow-mapSize-height={mapSize}
      shadow-camera-left={-coverM} shadow-camera-right={coverM} shadow-camera-top={coverM} shadow-camera-bottom={-coverM}
      shadow-camera-near={1} shadow-camera-far={coverM * 6} shadow-bias={-0.0002} shadow-normalBias={coverM / mapSize * 1.5} />
  </>;
}

function DemTerrain({ surface, colorMode, detail, sunDir, autoLight, building, meshRef, onVisibility, onPointer, onPick }: {
  surface: DemSurface; colorMode: TerrainColorMode; detail: "high" | "low"; sunDir: THREE.Vector3; autoLight: boolean; building: boolean;
  meshRef: MutableRefObject<THREE.Mesh | null>;
  onVisibility: (field: Float32Array) => void;
  onPointer: (point: THREE.Vector3 | null) => void; onPick: (point: THREE.Vector3) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => createDemGeometry(surface, "regolith"), [surface]);
  const detailTexture = useMemo(() => createRegolithDetailTexture(), []);
  useEffect(() => () => detailTexture.dispose(), [detailTexture]);
  // Cosmetic micro-relief (craterlets, pebbles) as a normal map: shading only, heights untouched.
  const normalTexture = useMemo(() => createRegolithNormalTexture(detail === "high" ? 512 : 256), [detail]);
  useEffect(() => () => normalTexture.dispose(), [normalTexture]);
  const material = useMemo(() => {
    const regolith = colorMode === "regolith";
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0,
      map: regolith ? detailTexture : null, normalMap: regolith ? normalTexture : null, normalScale: new THREE.Vector2(0.9, 0.9) });
    patchSunVisibility(m, "attribute");
    return m;
  }, [colorMode, detailTexture, normalTexture]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    fillColors(surface, colorMode, colors.array as Float32Array);
    colors.needsUpdate = true;
    invalidate();
  }, [geometry, surface, colorMode, invalidate, material, detailTexture]);

  // Terrain-blocked sunlight, recomputed as the Sun moves (throttled during fast playback).
  const lastRun = useRef(0);
  useEffect(() => {
    const attribute = geometry.getAttribute("sunVis") as THREE.BufferAttribute;
    if (autoLight) {
      // Auto-illuminated: no terrain-blocked sunlight in the picture.
      (attribute.array as Float32Array).fill(1);
      attribute.needsUpdate = true;
      onVisibility(attribute.array as Float32Array);
      invalidate();
      return;
    }
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
  }, [geometry, surface, sunDir, autoLight, onVisibility, invalidate]);

  // Terrain does not cast into the shadow map: terrain-on-terrain shadowing comes from the
  // per-vertex ray march (exact at grid resolution, whole tile); the map only carries hardware.
  return <mesh ref={meshRef} geometry={geometry} material={material} receiveShadow
    // Raycasting the full mesh is only worth it while placing objects.
    onPointerMove={building ? (e: ThreeEvent<PointerEvent>) => onPointer(e.point) : undefined}
    onPointerOut={building ? () => onPointer(null) : undefined}
    // A click that travelled more than a few pixels was a rotate-drag, not a placement.
    onClick={(e: ThreeEvent<MouseEvent>) => { if (e.button === 0 && e.delta <= 6) { e.stopPropagation(); onPick(e.point); } }} />;
}

const noRaycast = () => {};

/** Translucent walls around the whole tile, following the terrain edge, so the planner has a clear boundary. */
function BorderWalls({ surface }: { surface: DemSurface }) {
  const { wall, base, top } = useMemo(() => {
    const { size, spacing, half, worldY } = surface;
    const height = THREE.MathUtils.clamp(half * 0.03, 12, 300);
    // One closed loop around the tile: north edge west→east, east edge north→south, south edge east→west, west edge south→north.
    const ring: Array<[number, number, number]> = [];
    for (let k = 0; k < size - 1; k++) ring.push([-half + k * spacing, worldY[k], -half]);
    for (let k = 0; k < size - 1; k++) ring.push([half, worldY[k * size + size - 1], -half + k * spacing]);
    for (let k = 0; k < size - 1; k++) ring.push([half - k * spacing, worldY[(size - 1) * size + size - 1 - k], half]);
    for (let k = 0; k < size - 1; k++) ring.push([-half, worldY[(size - 1 - k) * size], half - k * spacing]);
    const n = ring.length;
    const positions = new Float32Array(n * 2 * 3), colors = new Float32Array(n * 2 * 4);
    const topLine = new Float32Array(n * 3), baseLine = new Float32Array(n * 3);
    ring.forEach(([x, y, z], i) => {
      positions.set([x, y - height * 0.3, z, x, y + height, z], i * 6);
      // Opaque-ish at the foot, fading toward the crest.
      colors.set([0.66, 0.53, 1, 0.42, 0.78, 0.68, 1, 0.05], i * 8);
      topLine.set([x, y + height, z], i * 3);
      baseLine.set([x, y + 0.6, z], i * 3);
    });
    const index = new (n * 2 > 65535 ? Uint32Array : Uint16Array)(n * 6);
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = ((i + 1) % n) * 2;
      index.set([a, b, a + 1, a + 1, b, b + 1], i * 6);
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    wallGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    wallGeometry.setIndex(new THREE.BufferAttribute(index, 1));
    const line = (data: Float32Array) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(data, 3));
      return g;
    };
    return { wall: wallGeometry, base: line(baseLine), top: line(topLine) };
  }, [surface]);
  useEffect(() => () => { wall.dispose(); base.dispose(); top.dispose(); }, [wall, base, top]);
  return <group>
    <mesh geometry={wall} raycast={noRaycast} renderOrder={2}><meshBasicMaterial vertexColors transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <lineLoop geometry={top} raycast={noRaycast} renderOrder={3}><lineBasicMaterial color="#c7b2ff" transparent opacity={0.95} toneMapped={false} /></lineLoop>
    <lineLoop geometry={base} raycast={noRaycast} renderOrder={3}><lineBasicMaterial color="#a986ff" transparent opacity={0.9} toneMapped={false} /></lineLoop>
  </group>;
}

function FootprintRing({ radius, color }: { radius: number; color: string }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
    <ringGeometry args={[radius, radius + Math.max(0.25, radius * 0.08), 40]} />
    <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
  </mesh>;
}

/**
 * Marks the site centre (the map's middle) with a light pillar and ground ring.
 * The pillar keeps a readable on-screen size from far away; it is decoration only.
 */
function CentreBeacon({ surface }: { surface: DemSurface }) {
  const y = groundY(surface, 0, 0);
  const pillar = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const world = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const group = pillar.current;
    if (!group) return;
    group.getWorldPosition(world.current);
    // Hidden while standing at the centre, so the camera is never inside the pillar or looking at the ring at its feet.
    const away = Math.hypot(camera.position.x - world.current.x, camera.position.z - world.current.z) > 15;
    group.visible = away;
    if (ring.current) ring.current.visible = away;
    group.scale.setScalar(Math.max(1, camera.position.distanceTo(world.current) * 0.004));
  });
  return <group position={[0, y, 0]}>
    <group ref={pillar}>
      <mesh position={[0, 20, 0]} raycast={noRaycast}><cylinderGeometry args={[0.25, 0.6, 40, 8, 1, true]} /><meshBasicMaterial color="#ff5364" transparent opacity={0.55} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 41.5, 0]} raycast={noRaycast}><octahedronGeometry args={[1.6, 0]} /><meshBasicMaterial color="#fff3e8" toneMapped={false} /></mesh>
    </group>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} raycast={noRaycast} renderOrder={4}>
      <ringGeometry args={[3, 3.8, 48]} /><meshBasicMaterial color="#ff5364" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

type Sky = { sunAz: number; sunEl: number; earthAz: number; earthEl: number };

function PlacedObject({ placement, surface, vis, sky, selected, interactive, onSelect, onView }: { placement: Placement; surface: DemSurface; vis: number; sky: Sky; selected: boolean; interactive: boolean; onSelect: (id: string) => void; onView: (id: string) => void }) {
  const x = placement.eastM, z = -placement.northM;
  const y = groundY(surface, x, z);
  const quaternion = useMemo(() => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -placement.headingDeg * Math.PI / 180);
    if (placement.type !== "rover") return yaw;
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), groundNormal(surface, x, z)).multiply(yaw);
  }, [placement.type, placement.headingDeg, surface, x, z]);
  // Trackers point in absolute directions, so undo the object's own heading for them.
  const localSunAz = sky.sunAz - placement.headingDeg, localEarthAz = sky.earthAz - placement.headingDeg;
  // Clicking selects, double-clicking goes to it. Not while placing, so the cursor never grabs the ground.
  const handlers = interactive ? {
    onClick: (e: ThreeEvent<MouseEvent>) => { if (e.button !== 0 || e.delta > 6) return; e.stopPropagation(); onSelect(placement.id); },
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onView(placement.id); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { document.body.style.cursor = ""; },
  } : {};
  return <group position={[x, y, z]} quaternion={quaternion} {...handlers}>
    {selected && <FootprintRing radius={SURFACE_OBJECTS[placement.type].footprintM + 0.6} color="#a986ff" />}
    <SunShaded vis={vis}>
      <SurfaceObjectModel type={placement.type} sunAzimuthDeg={localSunAz} sunElevationDeg={sky.sunEl} earthAzimuthDeg={localEarthAz} earthElevationDeg={sky.earthEl} />
    </SunShaded>
    <Beacon color={BEACON_COLORS[placement.type]} height={placement.type === "rover" ? 6 : 14} />
  </group>;
}

const MIN_PITCH = 1.0;
const MAX_PITCH = 1.5;
/** How far from the site centre the bird's-eye view can be panned, as a share of the tile half-width. */
const PAN_LIMIT = 0.25;
const DEFAULT_YAW = 0.6;
const DEFAULT_PITCH = 1.3;
/** Turning the bird's-eye view is limited to a slight swing either side of the default heading. */
const YAW_RANGE = 0.7;
const EYE_HEIGHT = 1.8;
const LOOK_PITCH_LIMIT = 1.2;
const defaultDistance = (halfExtentM: number) => Math.max(150, halfExtentM * 2.4);

export type ViewMode = "first-person" | "birds-eye";
/** Ask the camera to go and look at something (key changes each request). */
export type ViewTarget = { eastM: number; northM: number; footprintM: number; key: number };

/**
 * Two views. First person: stand on the ground at eye height, drag to look, WASD to walk (shift to hurry).
 * Bird's eye: a slight overhead view, drag to tilt and turn a little, right-drag or WASD to pan, wheel to zoom.
 * Nothing moves on hover in either.
 */
function DemRig({ grid, surface, radiusM, mode, zoom, lookSensitivity, still, building, terrainRef, focusRef, recenterKey, viewTarget, shadowDirtyRef, onFocus, onTutorialAction }: {
  grid: DemGrid; surface: DemSurface; radiusM: number; mode: ViewMode; zoom: number; lookSensitivity: number; still: boolean;
  building: boolean; terrainRef: MutableRefObject<THREE.Mesh | null>;
  focusRef: MutableRefObject<THREE.Vector3>; recenterKey: number; viewTarget: ViewTarget | null; shadowDirtyRef: MutableRefObject<boolean>;
  onFocus: (state: FocusState) => void; onTutorialAction?: (action: "look" | "move") => void;
}) {
  const { gl, camera, invalidate } = useThree();
  // Bird's eye.
  const yaw = useRef(DEFAULT_YAW);
  const pitch = useRef(DEFAULT_PITCH);
  const distance = useRef(defaultDistance(grid.halfExtentM));
  // First person.
  const heading = useRef(0);
  const lookPitch = useRef(-0.04);
  const fovZoom = useRef(1);
  const keys = useRef(new Set<string>());
  const drag = useRef<{ mode: "rotate" | "pan" | "position"; x: number; y: number; pointerId: number; offsetX?: number; offsetZ?: number } | null>(null);
  const snap = useRef(true);
  const lastMode = useRef(mode);
  const marker = useRef<THREE.Group>(null);
  const lastReport = useRef(0);
  const desired = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  // A new grid (site or radius) or the reset button returns to the starting spot and view.
  useEffect(() => {
    focusRef.current.set(0, 0, 0);
    yaw.current = DEFAULT_YAW;
    pitch.current = DEFAULT_PITCH;
    distance.current = defaultDistance(grid.halfExtentM);
    heading.current = 0;
    lookPitch.current = -0.04;
    fovZoom.current = 1;
    snap.current = true;
    shadowDirtyRef.current = true;
    invalidate();
  }, [grid, recenterKey, focusRef, shadowDirtyRef, invalidate]);

  // Switching views keeps your place: first person faces where the bird's-eye camera was looking.
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    if (mode === "first-person") { heading.current = -yaw.current; lookPitch.current = -0.04; }
    snap.current = true;
    shadowDirtyRef.current = true;
    invalidate();
  }, [mode, shadowDirtyRef, invalidate]);

  // "View" on a placed object: bird's eye centres on it; first person stands back from it, facing it.
  useEffect(() => {
    if (!viewTarget) return;
    const f = focusRef.current, limit = radiusM - 2;
    if (mode === "first-person") {
      const standOff = viewTarget.footprintM * 2.2 + 12;
      f.x = THREE.MathUtils.clamp(viewTarget.eastM, -limit, limit);
      f.z = THREE.MathUtils.clamp(-viewTarget.northM + standOff, -limit, limit);
      heading.current = Math.atan2(viewTarget.eastM - f.x, -(-viewTarget.northM - f.z));
      lookPitch.current = 0.08;
    } else {
      f.x = THREE.MathUtils.clamp(viewTarget.eastM, -limit, limit); f.z = THREE.MathUtils.clamp(-viewTarget.northM, -limit, limit);
      distance.current = Math.max(30, viewTarget.footprintM * 4 + 25) / Math.max(0.5, zoom);
      pitch.current = 1.1;
    }
    snap.current = true;
    shadowDirtyRef.current = true;
    invalidate();
    // Only a new request (key) should move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTarget?.key]);

  useEffect(() => {
    const el = gl.domElement;
    const moveKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
    const pressed = keys.current;
    /** Bird's eye: move the focus point by metres along the screen's right and forward directions. */
    const panBy = (right: number, forward: number) => {
      const f = focusRef.current, limit = radiusM * PAN_LIMIT;
      const reach = (v: number) => Math.max(limit, Math.abs(v));
      f.x = THREE.MathUtils.clamp(f.x + Math.cos(yaw.current) * right - Math.sin(yaw.current) * forward, -reach(f.x), reach(f.x));
      f.z = THREE.MathUtils.clamp(f.z - Math.sin(yaw.current) * right - Math.cos(yaw.current) * forward, -reach(f.z), reach(f.z));
      shadowDirtyRef.current = true;
      invalidate();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (keyBelongsToControl(event.target, event.key)) return;
      const key = event.key.toLowerCase();
      if (!moveKeys.has(key) || event.metaKey || event.ctrlKey) return;
      if (key !== "shift") { event.preventDefault(); onTutorialAction?.("move"); }
      pressed.add(key);
      invalidate();
    };
    const keyUp = (event: KeyboardEvent) => { pressed.delete(event.key.toLowerCase()); invalidate(); };
    let suppressClick = false;
    const raycaster = new THREE.Raycaster();
    const pickGround = (event: PointerEvent) => terrainRef.current
      ? terrainUnderPointer(camera, terrainRef.current, event.clientX, event.clientY, el.getBoundingClientRect(), raycaster) : null;
    const overMarker = (event: PointerEvent) => {
      if (mode !== "birds-eye" || building || !marker.current?.visible) return false;
      const point = focusRef.current.clone().project(camera), bounds = el.getBoundingClientRect();
      if (point.z < -1 || point.z > 1) return false;
      return Math.hypot(event.clientX - bounds.left - (point.x + 1) * bounds.width / 2,
        event.clientY - bounds.top - (1 - point.y) * bounds.height / 2) <= (event.pointerType === "touch" ? 34 : 25);
    };
    const finishDrag = () => {
      const current = drag.current;
      drag.current = null;
      if (current && el.hasPointerCapture(current.pointerId)) el.releasePointerCapture(current.pointerId);
      el.style.cursor = "";
      if (current?.mode === "position") {
        onFocus({ eastM: focusRef.current.x, northM: -focusRef.current.z });
        invalidate();
      }
    };
    const blur = () => { pressed.clear(); finishDrag(); };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      // Take keyboard focus back from the panels so WASD drives the view.
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
      suppressClick = false;
      if (event.button === 0 && overMarker(event)) {
        const point = pickGround(event);
        if (!point) return;
        event.preventDefault(); event.stopPropagation();
        pressed.clear();
        drag.current = { mode: "position", x: event.clientX, y: event.clientY, pointerId: event.pointerId,
          offsetX: focusRef.current.x - point.x, offsetZ: focusRef.current.z - point.z };
        suppressClick = true;
        el.style.cursor = "grabbing";
        el.setPointerCapture(event.pointerId);
        invalidate();
        return;
      }
      const pan = mode === "birds-eye" && (event.button === 2 || event.shiftKey);
      drag.current = { mode: pan ? "pan" : "rotate", x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      el.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const d = drag.current;
      if (!d) { el.style.cursor = overMarker(event) ? "grab" : ""; return; }
      if (event.pointerId !== d.pointerId) return;
      // The button was released somewhere we never saw (outside the window, after a context menu):
      // end the drag instead of letting the view keep following the mouse.
      if (event.buttons === 0) { finishDrag(); return; }
      if (d.mode === "position") {
        event.preventDefault(); event.stopPropagation();
        const point = pickGround(event);
        if (!point) return;
        const location = markerLocation(point, d.offsetX ?? 0, d.offsetZ ?? 0, radiusM);
        focusRef.current.set(location.eastM, groundY(surface, location.eastM, -location.northM), -location.northM);
        shadowDirtyRef.current = true;
        onFocus(location);
        onTutorialAction?.("move");
        invalidate();
        return;
      }
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      d.x = event.clientX; d.y = event.clientY;
      if (mode === "first-person") {
        heading.current += dx * 0.004 * lookSensitivity;
        lookPitch.current = THREE.MathUtils.clamp(lookPitch.current - dy * 0.003 * lookSensitivity, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT);
        if (dx !== 0 || dy !== 0) onTutorialAction?.("look");
      } else if (d.mode === "rotate") {
        yaw.current = THREE.MathUtils.clamp(yaw.current - dx * 0.005 * lookSensitivity, DEFAULT_YAW - YAW_RANGE, DEFAULT_YAW + YAW_RANGE);
        pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.004 * lookSensitivity, MIN_PITCH, MAX_PITCH);
        if (dx !== 0 || dy !== 0) onTutorialAction?.("look");
      } else {
        const metresPerPixel = distance.current * zoom * 0.0016;
        panBy(-dx * metresPerPixel, dy * metresPerPixel);
        if (dx !== 0 || dy !== 0) onTutorialAction?.("move");
      }
      invalidate();
    };
    const up = (event: PointerEvent) => {
      if (drag.current && event.pointerId !== drag.current.pointerId) return;
      if (drag.current?.mode === "position") event.stopPropagation();
      finishDrag();
    };
    const leave = (event: PointerEvent) => { if (event.buttons === 0) finishDrag(); };
    const click = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } };
    const menu = (event: MouseEvent) => { event.preventDefault(); finishDrag(); };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current?.mode === "position") return;
      if (mode === "first-person") fovZoom.current = THREE.MathUtils.clamp(fovZoom.current * Math.exp(event.deltaY * 0.001), 0.35, 1.4);
      else distance.current = THREE.MathUtils.clamp(distance.current * Math.exp(event.deltaY * 0.0012), 12, Math.max(400, radiusM * 3));
      invalidate();
    };
    const focusControl = (event: FocusEvent) => { if (keyBelongsToControl(event.target, "w")) blur(); };
    window.addEventListener("focusin", focusControl);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("click", click, true);
    el.addEventListener("contextmenu", menu);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("focusin", focusControl);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("click", click, true);
      finishDrag();
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("wheel", wheel);
      pressed.clear();
      drag.current = null;
    };
  }, [gl, camera, mode, zoom, lookSensitivity, radiusM, focusRef, shadowDirtyRef, invalidate, onTutorialAction, onFocus, building, terrainRef, surface]);

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const f = focusRef.current;
    const k = keys.current;
    const forward = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const strafe = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const far = Math.max(8000, radiusM * 3.2);
    if (camera.far !== far) { camera.far = far; camera.near = 0.25; camera.updateProjectionMatrix(); }

    if (mode === "first-person") {
      if (forward !== 0 || strafe !== 0) {
        // Walking pace (48 m/s, 160 m/s with shift), scaled up on big areas so they stay crossable; shift hurries.
        const speed = (k.has("shift") ? 160 : 48) * Math.max(1, radiusM / 10_000);
        const step = Math.min(delta, 0.05) * speed / Math.hypot(forward, strafe);
        const h = heading.current, limit = radiusM - 1.5;
        f.x = THREE.MathUtils.clamp(f.x + (Math.sin(h) * forward + Math.cos(h) * strafe) * step, -limit, limit);
        f.z = THREE.MathUtils.clamp(f.z + (-Math.cos(h) * forward + Math.sin(h) * strafe) * step, -limit, limit);
        shadowDirtyRef.current = true;
        state.invalidate();
      }
      f.y = groundY(surface, f.x, f.z);
      const fov = THREE.MathUtils.clamp(68 * zoom * fovZoom.current, 22, 100);
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.set(f.x, f.y + EYE_HEIGHT, f.z);
      const h = heading.current, p = lookPitch.current;
      lookTarget.current.set(f.x + Math.sin(h) * Math.cos(p) * 60, f.y + EYE_HEIGHT + Math.sin(p) * 60, f.z - Math.cos(h) * Math.cos(p) * 60);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookTarget.current);
      snap.current = false;
      if (marker.current) marker.current.visible = false;
    } else {
      const movingMarker = drag.current?.mode === "position";
      if (!movingMarker && (forward !== 0 || strafe !== 0)) {
        const step = Math.min(delta, 0.05) * distance.current * zoom * 0.45 / Math.hypot(forward, strafe);
        const limit = radiusM * PAN_LIMIT, reach = (v: number) => Math.max(limit, Math.abs(v));
        f.x = THREE.MathUtils.clamp(f.x + (Math.cos(yaw.current) * strafe - Math.sin(yaw.current) * forward) * step, -reach(f.x), reach(f.x));
        f.z = THREE.MathUtils.clamp(f.z + (-Math.sin(yaw.current) * strafe - Math.cos(yaw.current) * forward) * step, -reach(f.z), reach(f.z));
        shadowDirtyRef.current = true;
        state.invalidate();
      }
      f.y = groundY(surface, f.x, f.z);
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
      const d = distance.current * zoom;
      if (!movingMarker) {
        desired.current.set(
          f.x + Math.sin(yaw.current) * Math.cos(pitch.current) * d,
          f.y + Math.sin(pitch.current) * d,
          f.z + Math.cos(yaw.current) * Math.cos(pitch.current) * d,
        );
        desired.current.y = Math.max(desired.current.y, groundY(surface, desired.current.x, desired.current.z) + 3);
        if (still || snap.current) { camera.position.copy(desired.current); snap.current = false; }
        else camera.position.lerp(desired.current, 1 - Math.exp(-delta * 8));
        camera.up.set(0, 1, 0);
        lookTarget.current.set(f.x, f.y + 1.5, f.z);
        camera.lookAt(lookTarget.current);
      }
      if (marker.current) {
        marker.current.visible = true;
        marker.current.position.set(f.x, f.y, f.z);
        marker.current.scale.setScalar(Math.max(1, d * 0.012));
      }
    }
    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.2) {
      lastReport.current = now;
      onFocus({ eastM: f.x, northM: -f.z });
    }
  });

  // Current ground position shared by the bird's-eye marker and first-person view.
  return <group ref={marker}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} raycast={noRaycast} renderOrder={4}>
      <ringGeometry args={[1.5, 2, 32]} /><meshBasicMaterial color="#a986ff" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} raycast={noRaycast} renderOrder={4}>
      <circleGeometry args={[0.35, 12]} /><meshBasicMaterial color="#ff5364" depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

function SceneContents(props: DemSceneProps) {
  const { grid, radiusM, exaggeration, colorMode, detail, still = false, viewMode, viewTarget, selectedId, onSelectObject, onViewObject, zoom, lookSensitivity, autoLight, sunAzimuthDeg, sunElevationDeg, earthAzimuthDeg, earthElevationDeg, placements, buildType, buildHeadingDeg, onPlace, onHoverCheck, onFocus, onTutorialAction, recenterKey } = props;
  const surface = useMemo(() => buildDemSurface(grid, exaggeration), [grid, exaggeration]);
  const sunDir = useMemo(() => toVec(horizonDirection(sunAzimuthDeg, sunElevationDeg)), [sunAzimuthDeg, sunElevationDeg]);
  const earthDir = useMemo(() => toVec(horizonDirection(earthAzimuthDeg, earthElevationDeg)), [earthAzimuthDeg, earthElevationDeg]);
  const focus = useRef(new THREE.Vector3());
  const terrainRef = useRef<THREE.Mesh | null>(null);
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
    <hemisphereLight args={autoLight ? ["#f0f0f0", "#707070", 1.5] : ["#929292", "#101010", 0.22]} />
    <ambientLight intensity={autoLight ? 0.7 : 0.03} />
    <DemSunLight direction={autoLight ? AUTO_LIGHT_DIR : sunDir} intensity={autoLight ? 3 : 4.2} focusRef={focus} coverM={Math.min(radiusM, detail === "high" ? 450 : 300)} mapSize={detail === "high" ? 2048 : 1024} shadowDirtyRef={shadowDirty} />
    <DemTerrain meshRef={terrainRef} surface={surface} colorMode={colorMode} detail={detail} sunDir={sunDir} autoLight={autoLight} building={!!buildType} onVisibility={onVisibility}
      onPointer={(point) => { if (buildType) { setHover(point ? point.clone() : null); invalidate(); } }}
      onPick={(point) => {
        if (!buildType) { onSelectObject(null); return; }
        if (checkPlacement(grid, radiusM, placements, buildType, point.x, -point.z).ok) onPlace(point.x, -point.z);
      }} />
    <BorderWalls surface={surface} />
    <CentreBeacon surface={surface} />
    {/* Decorative near-field rocks for motion cues while walking; never part of the analysed DEM. */}
    {viewMode === "first-person" && <SurfaceRocks surface={surface} detail={detail} focusRef={focus} shadowDirtyRef={shadowDirty} visField={vis.field} visVersion={vis.version} placements={placements} />}
    {placements.map((placement) => <PlacedObject key={placement.id} placement={placement} surface={surface} vis={visAt(placement.eastM, -placement.northM)} sky={sky} selected={placement.id === selectedId} interactive={!buildType} onSelect={onSelectObject} onView={onViewObject} />)}
    {ghost && buildType && <group position={[ghost.x, ghost.y, ghost.z]} rotation={[0, -buildHeadingDeg * Math.PI / 180, 0]}>
      <SunShaded vis={visAt(ghost.x, ghost.z)}>
        <SurfaceObjectModel type={buildType} sunAzimuthDeg={sky.sunAz - buildHeadingDeg} sunElevationDeg={sky.sunEl} earthAzimuthDeg={sky.earthAz - buildHeadingDeg} earthElevationDeg={sky.earthEl} />
      </SunShaded>
      <FootprintRing radius={SURFACE_OBJECTS[buildType].footprintM} color={ghost.check.ok ? "#7be0a0" : "#ff5364"} />
    </group>}
    <DemRig building={!!buildType} terrainRef={terrainRef} grid={grid} surface={surface} radiusM={radiusM} mode={viewMode} viewTarget={viewTarget} zoom={zoom} lookSensitivity={lookSensitivity} still={still}
      focusRef={focus} recenterKey={recenterKey} shadowDirtyRef={shadowDirty} onFocus={onFocus} onTutorialAction={onTutorialAction} />
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
