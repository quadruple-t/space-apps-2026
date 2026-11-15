"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LunarRover } from "./rover";
import { patchSunVisibility } from "./dem-terrain";

/**
 * Placeable surface hardware for the drive, modelled at real-world scale in metres
 * (origin on the ground at the footprint centre, front toward -Z). Shapes are generic
 * concepts, not models of specific flight hardware.
 */

export type SurfaceObjectType = "solar" | "rover" | "dome" | "modules" | "inflatable" | "comms";

export type SurfaceObjectSpec = {
  label: string;
  short: string;
  description: string;
  /** Footprint radius (m) used for the slope check and the placement ring. */
  footprintM: number;
  /** Indicative maximum ground slope for placement, degrees. */
  maxSlopeDeg: number;
};

export const SURFACE_OBJECTS: Record<SurfaceObjectType, SurfaceObjectSpec> = {
  solar: { label: "Solar array", short: "Solar", description: "Vertical sun-tracking array, 3 × 6 m panel on a 6 m mast.", footprintM: 3.5, maxSlopeDeg: 15 },
  rover: { label: "Lunar buggy", short: "Buggy", description: "Unpressurised crew rover, about 3.8 m long.", footprintM: 2.6, maxSlopeDeg: 25 },
  dome: { label: "Base · dome habitat", short: "Dome", description: "8 m dome under a regolith berm, with an airlock tunnel.", footprintM: 6, maxSlopeDeg: 10 },
  modules: { label: "Base · modular outpost", short: "Modules", description: "Two 4.5 m rigid modules joined by a node, on levelling legs.", footprintM: 9, maxSlopeDeg: 8 },
  inflatable: { label: "Base · inflatable habitat", short: "Inflatable", description: "7 m soft-goods habitat on a landing-leg frame.", footprintM: 5, maxSlopeDeg: 10 },
  comms: { label: "Comms mast", short: "Comms", description: "8 m mast with a dish that tracks Earth.", footprintM: 2, maxSlopeDeg: 15 },
};

export const SURFACE_OBJECT_TYPES = Object.keys(SURFACE_OBJECTS) as SurfaceObjectType[];

const WHITE = "#e9e6f0";
const SHELL = "#c9c4d6";
const DARK = "#3a3550";
const PURPLE = "#a986ff";
const BLUE = "#4b9bff";
const CORAL = "#ff5364";
const REGOLITH = "#7b7884";
const rad = (deg: number) => (deg * Math.PI) / 180;

function Std({ color, metal = 0.1, rough = 0.7, emissive }: { color: string; metal?: number; rough?: number; emissive?: string }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.6 : 0} />;
}

export function SolarArray({ sunAzimuthDeg, sunElevationDeg }: { sunAzimuthDeg: number; sunElevationDeg: number }) {
  const tilt = rad(Math.max(0, Math.min(89, sunElevationDeg)));
  return <group>
    {[0, 120, 240].map((a) => <mesh key={a} castShadow position={[Math.sin(rad(a)) * 1.2, 0.5, Math.cos(rad(a)) * 1.2]} rotation={[Math.cos(rad(a)) * 0.6, 0, -Math.sin(rad(a)) * 0.6]}>
      <cylinderGeometry args={[0.07, 0.07, 1.4, 6]} /><Std color={SHELL} metal={0.5} />
    </mesh>)}
    <mesh castShadow position={[0, 3.4, 0]}><cylinderGeometry args={[0.14, 0.2, 6, 8]} /><Std color={WHITE} metal={0.4} rough={0.4} /></mesh>
    {/* Azimuth then elevation: the panel normal points at the Sun. */}
    <group position={[0, 6.2, 0]} rotation={[0, -rad(sunAzimuthDeg), 0]}>
      <group rotation={[tilt, 0, 0]}>
        <mesh castShadow receiveShadow position={[0, 0, -0.12]}><boxGeometry args={[3, 6, 0.08]} /><Std color="#22406b" metal={0.55} rough={0.35} /></mesh>
        {[-1, 0, 1].map((c) => <mesh key={`c${c}`} position={[c, 0, -0.17]}><boxGeometry args={[0.03, 5.9, 0.01]} /><meshBasicMaterial color="#70d7ff" /></mesh>)}
        {[-2, -1, 0, 1, 2].map((r) => <mesh key={`r${r}`} position={[0, r * 1.2, -0.17]}><boxGeometry args={[2.95, 0.03, 0.01]} /><meshBasicMaterial color="#70d7ff" /></mesh>)}
        <mesh castShadow position={[0, 0, 0.02]}><boxGeometry args={[0.2, 6.1, 0.18]} /><Std color={SHELL} metal={0.5} /></mesh>
      </group>
    </group>
  </group>;
}

export function DomeHabitat() {
  return <group>
    <mesh castShadow receiveShadow position={[0, 0.2, 0]}><sphereGeometry args={[4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><Std color={SHELL} rough={0.6} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]}><torusGeometry args={[4.7, 1.1, 10, 40]} /><Std color={REGOLITH} rough={1} /></mesh>
    <mesh position={[0, 3.9, 0]}><cylinderGeometry args={[0.9, 0.9, 0.25, 16]} /><Std color={PURPLE} emissive="#3b2a78" /></mesh>
    {[30, 150, 270].map((a) => <mesh key={a} position={[Math.sin(rad(a)) * 3.55, 2.1, Math.cos(rad(a)) * 3.55]} rotation={[0, rad(a), 0]}><boxGeometry args={[0.9, 0.5, 0.15]} /><meshBasicMaterial color="#ffd8a6" /></mesh>)}
    <group position={[0, 1.15, -5.6]}>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.15, 1.15, 3.4, 16]} /><Std color={WHITE} rough={0.5} /></mesh>
      <mesh position={[0, 0, -1.75]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.95, 0.95, 0.12, 16]} /><Std color={CORAL} emissive="#5a1020" /></mesh>
    </group>
    <mesh castShadow position={[2.2, 5.2, 1]}><cylinderGeometry args={[0.05, 0.05, 2.4, 6]} /><Std color={WHITE} /></mesh>
  </group>;
}

function OutpostModule({ position, rotationY = 0, accent }: { position: [number, number, number]; rotationY?: number; accent: string }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[2.25, 2.25, 9, 24]} /><Std color={WHITE} rough={0.45} metal={0.2} /></mesh>
      {[-4.5, 4.5].map((x) => <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.35, 1, 1]}><sphereGeometry args={[2.25, 20, 12]} /><Std color={SHELL} /></mesh>)}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[2.27, 2.27, 0.5, 24]} /><Std color={accent} emissive={accent === CORAL ? "#4a0e1c" : "#24185a"} /></mesh>
      {[-3, 3].map((x) => [-1, 1].map((s) => <mesh key={`${x}${s}`} castShadow position={[x, -2.3, s * 1.5]}><cylinderGeometry args={[0.12, 0.18, 1.4, 6]} /><Std color={DARK} /></mesh>))}
  </group>;
}

export function ModularOutpost() {
  return <group position={[0, 3, 0]}>
    <OutpostModule position={[-4.2, 0, 0]} accent={PURPLE} />
    <OutpostModule position={[1.6, 0, -6.2]} rotationY={Math.PI / 2} accent={CORAL} />
    <mesh castShadow receiveShadow position={[1.6, 0, 0]}><sphereGeometry args={[2.6, 24, 16]} /><Std color={SHELL} metal={0.25} rough={0.5} /></mesh>
    <mesh castShadow position={[1.6, 3.2, 0]}><boxGeometry args={[0.15, 1.6, 0.15]} /><Std color={WHITE} /></mesh>
    <mesh castShadow position={[1.6, 4, 0]} rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.06, 4.5, 1.6]} /><Std color="#d7dcef" metal={0.3} rough={0.3} /></mesh>
  </group>;
}

export function InflatableHabitat() {
  return <group>
    {[0, 90, 180, 270].map((a) => <group key={a} rotation={[0, rad(a + 45), 0]}>
      <mesh castShadow position={[0, 1.1, -3.7]} rotation={[0.35, 0, 0]}><cylinderGeometry args={[0.12, 0.16, 2.6, 6]} /><Std color={DARK} metal={0.5} /></mesh>
      <mesh position={[0, 0.06, -4.1]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.45, 12]} /><Std color={DARK} /></mesh>
    </group>)}
    <mesh castShadow receiveShadow position={[0, 1.9, 0]}><cylinderGeometry args={[3.2, 3.3, 0.6, 24]} /><Std color={SHELL} metal={0.4} /></mesh>
    <mesh castShadow receiveShadow position={[0, 5.4, 0]} scale={[1, 1.15, 1]}><sphereGeometry args={[3.5, 32, 20]} /><Std color="#ece7dc" rough={0.95} /></mesh>
    {[4.2, 5.8, 7.2].map((y, i) => <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[[3.4, 3.48, 3.0][i], 0.07, 6, 40]} /><Std color={i === 1 ? PURPLE : SHELL} /></mesh>)}
    <mesh position={[0, 9.4, 0]}><cylinderGeometry args={[0.8, 1.1, 0.5, 16]} /><Std color={WHITE} metal={0.4} /></mesh>
    <mesh position={[0, 5.4, -3.42]}><circleGeometry args={[0.45, 16]} /><meshBasicMaterial color="#ffd8a6" /></mesh>
    <group position={[0, 1.2, -3.3]} rotation={[-0.45, 0, 0]}>
      {[-0.35, 0.35].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.06, 2.6, 0.06]} /><Std color={CORAL} /></mesh>)}
    </group>
  </group>;
}

export function CommsMast({ earthAzimuthDeg, earthElevationDeg }: { earthAzimuthDeg: number; earthElevationDeg: number }) {
  return <group>
    {[0, 120, 240].map((a) => <mesh key={a} castShadow position={[Math.sin(rad(a)) * 0.9, 0.6, Math.cos(rad(a)) * 0.9]} rotation={[Math.cos(rad(a)) * 0.5, 0, -Math.sin(rad(a)) * 0.5]}>
      <cylinderGeometry args={[0.06, 0.06, 1.5, 6]} /><Std color={SHELL} metal={0.5} />
    </mesh>)}
    <mesh castShadow position={[0, 4.2, 0]}><cylinderGeometry args={[0.1, 0.16, 8, 8]} /><Std color={WHITE} metal={0.4} /></mesh>
    <group position={[0, 8.2, 0]} rotation={[0, -rad(earthAzimuthDeg), 0]}>
      <group rotation={[rad(Math.max(-5, earthElevationDeg)), 0, 0]}>
        <mesh castShadow position={[0, 0, -0.35]} rotation={[-Math.PI / 2, 0, 0]}><sphereGeometry args={[1.2, 24, 8, 0, Math.PI * 2, 0, 0.75]} /><meshStandardMaterial color={WHITE} metalness={0.3} roughness={0.35} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0, -1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 1.3, 6]} /><Std color={SHELL} /></mesh>
        <mesh position={[0, 0, -1.65]}><sphereGeometry args={[0.1, 8, 6]} /><meshBasicMaterial color={BLUE} /></mesh>
      </group>
    </group>
    <mesh position={[0, 8.9, 0]}><sphereGeometry args={[0.12, 8, 6]} /><meshBasicMaterial color={CORAL} /></mesh>
  </group>;
}

export function SurfaceObjectModel({ type, sunAzimuthDeg, sunElevationDeg, earthAzimuthDeg, earthElevationDeg }: { type: SurfaceObjectType; sunAzimuthDeg: number; sunElevationDeg: number; earthAzimuthDeg: number; earthElevationDeg: number }) {
  switch (type) {
    case "solar": return <SolarArray sunAzimuthDeg={sunAzimuthDeg} sunElevationDeg={sunElevationDeg} />;
    case "rover": return <LunarRover position={[0, -0.02, 0]} />;
    case "dome": return <DomeHabitat />;
    case "modules": return <ModularOutpost />;
    case "inflatable": return <InflatableHabitat />;
    case "comms": return <CommsMast earthAzimuthDeg={earthAzimuthDeg} earthElevationDeg={earthElevationDeg} />;
  }
}

/** Scales the Sun's direct light on every lit material below by `vis` (terrain-blocked sunlight). */
export function SunShaded({ vis, children }: { vis: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const uniform = useRef({ value: vis });
  useEffect(() => {
    uniform.current.value = vis;
    group.current?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof THREE.MeshStandardMaterial && !material.userData.sunVisPatched) {
          patchSunVisibility(material, uniform.current);
          material.userData.sunVisPatched = true;
        }
      }
    });
  });
  return <group ref={group}>{children}</group>;
}

/** Map-scale marker above a placed object so it stays findable from orbit and overhead views. */
export function Beacon({ color, height }: { color: string; height: number }) {
  const marker = useRef<THREE.Group>(null);
  const world = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const group = marker.current;
    if (!group) return;
    group.getWorldPosition(world.current);
    const distance = camera.position.distanceTo(world.current);
    // Hidden up close (the model itself is visible); grows with distance to keep a constant screen size.
    group.visible = distance > 120;
    group.scale.setScalar(Math.max(1, distance * 0.012));
  });
  return <group ref={marker} position={[0, height, 0]}>
    <mesh><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <mesh position={[0, -1.6, 0]}><cylinderGeometry args={[0.08, 0.08, 2.2, 4]} /><meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} /></mesh>
  </group>;
}
