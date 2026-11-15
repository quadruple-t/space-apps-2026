"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { patchSunVisibility } from "./dem-terrain";

/**
 * Placeable surface hardware for the planner, modelled at real-world scale in metres (origin on the
 * ground at the footprint centre, front toward -Z). These are generic concept shapes, not models of
 * specific flight hardware. Everything stands on a levelled pad so slopes do not leave gaps.
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
  solar: { label: "Solar panel array", short: "Solar", description: "Four sun-tracking panels with 18 m² total active area on a tripod-braced 6.4 m mast.", footprintM: 3.5, maxSlopeDeg: 15 },
  rover: { label: "Lunar buggy", short: "Buggy", description: "Open-frame two-seat crew buggy with a dish and electronics bay, about 3.1 m long.", footprintM: 2.6, maxSlopeDeg: 25 },
  dome: { label: "Habitat", short: "Habitat", description: "8 m geodesic dome inside a regolith berm, with an airlock tunnel.", footprintM: 6, maxSlopeDeg: 10 },
  modules: { label: "Base · modular outpost", short: "Modules", description: "Hub-and-spoke outpost: a central node and two 5.5 m rigid modules on levelling legs.", footprintM: 9, maxSlopeDeg: 8 },
  inflatable: { label: "Base · inflatable habitat", short: "Inflatable", description: "6 m strapped inflatable envelope on a rigid deck and legs, with an airlock and ladder.", footprintM: 5, maxSlopeDeg: 10 },
  comms: { label: "Comms mast", short: "Comms", description: "7.7 m mast with a 2.6 m parabolic dish that tracks Earth.", footprintM: 2, maxSlopeDeg: 15 },
};

export const SURFACE_OBJECT_TYPES = ["solar", "rover", "comms", "dome"] as SurfaceObjectType[];

const WHITE = "#e9e6f0";
const SHELL = "#c4c0d0";
const METAL = "#9a97a8";
const DARK = "#2f2b42";
const PURPLE = "#a986ff";
const CORAL = "#ff5364";
const GOLD = "#c9a54a";
const FABRIC = "#e6e0d0";
const PAD = "#6a665f";
const rad = (deg: number) => (deg * Math.PI) / 180;
type V3 = [number, number, number];

function Std({ color, metal = 0.1, rough = 0.7, emissive, flat = false }: { color: string; metal?: number; rough?: number; emissive?: string; flat?: boolean }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={rough} flatShading={flat} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.7 : 0} />;
}

/** Cylinder from point `from` to point `to`: braces, legs and masts stay attached whatever the angle. */
function Strut({ from, to, radius = 0.08, color = SHELL, metal = 0.5 }: { from: V3; to: V3; radius?: number; color?: string; metal?: number }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const position = a.clone().add(b).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return <mesh castShadow position={position} quaternion={quaternion}>
    <cylinderGeometry args={[radius, radius, length, 6]} /><Std color={color} metal={metal} rough={0.45} />
  </mesh>;
}

/** Levelled gravel pad: its top is just above the ground and its body sinks below the slope. */
function LevelPad({ radius }: { radius: number }) {
  return <mesh receiveShadow position={[0, -1.0, 0]}>
    <cylinderGeometry args={[radius, radius * 1.1, 2.3, 24]} /><Std color={PAD} rough={1} flat />
  </mesh>;
}

/** Foot plate under a leg. */
function Foot({ at, radius = 0.4 }: { at: V3; radius?: number }) {
  return <mesh castShadow position={[at[0], at[1] + 0.06, at[2]]}><cylinderGeometry args={[radius, radius * 1.15, 0.12, 12]} /><Std color={DARK} metal={0.3} /></mesh>;
}

/** Parabolic dish, axis +Y and opening toward +Y; the caller rotates it toward its target. */
function Dish({ radius, focal, color = WHITE }: { radius: number; focal: number; color?: string }) {
  const geometry = useMemo(() => {
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 14; k++) { const r = (radius * k) / 14; profile.push(new THREE.Vector2(r, (r * r) / (4 * focal))); }
    return new THREE.LatheGeometry(profile, 36);
  }, [radius, focal]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const rimY = (radius * radius) / (4 * focal);
  return <group>
    <mesh geometry={geometry} castShadow><meshStandardMaterial color={color} metalness={0.3} roughness={0.35} side={THREE.DoubleSide} /></mesh>
    {/* Feed horn at the focus, held by three rim struts. */}
    <mesh position={[0, focal, 0]}><cylinderGeometry args={[0.07, 0.1, 0.22, 8]} /><Std color={DARK} /></mesh>
    {[0, 120, 240].map((a) => <Strut key={a} from={[Math.sin(rad(a)) * radius, rimY, Math.cos(rad(a)) * radius]} to={[0, focal, 0]} radius={0.025} color={SHELL} />)}
  </group>;
}

/** Tripod from a ring on the ground up to the mast at `topY`. */
function Tripod({ spread, topY, radius = 0.07 }: { spread: number; topY: number; radius?: number }) {
  return <>{[0, 120, 240].map((a) => {
    const foot: V3 = [Math.sin(rad(a)) * spread, 0.1, Math.cos(rad(a)) * spread];
    return <group key={a}><Strut from={foot} to={[0, topY, 0]} radius={radius} /><Foot at={[foot[0], 0, foot[2]]} radius={0.28} /></group>;
  })}</>;
}

export function SolarArray({ sunAzimuthDeg, sunElevationDeg }: { sunAzimuthDeg: number; sunElevationDeg: number }) {
  const tilt = rad(Math.max(0, Math.min(89, sunElevationDeg)));
  return <group>
    <LevelPad radius={1.9} />
    <Tripod spread={1.6} topY={2.2} />
    <mesh castShadow position={[0, 3.3, 0]}><cylinderGeometry args={[0.1, 0.17, 6.4, 10]} /><Std color={WHITE} metal={0.4} rough={0.4} /></mesh>
    {/* Tracker head: azimuth turntable, then an elevation hinge. The panel normal points at the Sun. */}
    <group position={[0, 6.5, 0]} rotation={[0, -rad(sunAzimuthDeg), 0]}>
      <mesh castShadow><boxGeometry args={[0.55, 0.42, 0.55]} /><Std color={DARK} metal={0.4} /></mesh>
      <group rotation={[tilt, 0, 0]}>
        {/* Frame, front cell face, rear spine and cross-ribs. */}
        <mesh castShadow receiveShadow position={[0, 0, 0.03]}><boxGeometry args={[3.1, 6.1, 0.1]} /><Std color={SHELL} metal={0.5} rough={0.4} /></mesh>
        <mesh position={[0, 0, -0.03]}><boxGeometry args={[2.92, 5.92, 0.03]} /><Std color="#1c3a66" metal={0.55} rough={0.3} /></mesh>
        {/* Four separate panel faces share the 18 m² tracking assembly. */}
        <mesh position={[0, 0, -0.065]}><boxGeometry args={[0.07, 5.92, 0.035]} /><Std color={SHELL} /></mesh>
        <mesh position={[0, 0, -0.065]}><boxGeometry args={[2.92, 0.07, 0.035]} /><Std color={SHELL} /></mesh>
        {[-0.97, 0, 0.97].map((x) => <mesh key={`c${x}`} position={[x, 0, -0.05]}><boxGeometry args={[0.025, 5.9, 0.01]} /><meshBasicMaterial color="#6fb2ff" /></mesh>)}
        {[-2.4, -1.2, 0, 1.2, 2.4].map((y) => <mesh key={`r${y}`} position={[0, y, -0.05]}><boxGeometry args={[2.9, 0.025, 0.01]} /><meshBasicMaterial color="#6fb2ff" /></mesh>)}
        <mesh castShadow position={[0, 0, 0.16]}><boxGeometry args={[0.16, 6, 0.16]} /><Std color={METAL} metal={0.5} /></mesh>
        {[-2.2, 0, 2.2].map((y) => <mesh key={`b${y}`} castShadow position={[0, y, 0.14]}><boxGeometry args={[3, 0.1, 0.12]} /><Std color={METAL} metal={0.5} /></mesh>)}
      </group>
    </group>
  </group>;
}

/** Open-frame crew buggy: tube chassis, two seats, four sprung wheels, rear electronics bay and dish. */
export function CrewBuggy() {
  const wheels: V3[] = [[-1.05, 0.4, -1.05], [1.05, 0.4, -1.05], [-1.05, 0.4, 1.05], [1.05, 0.4, 1.05]];
  return <group>
    {wheels.map(([x, y, z]) => <group key={`${x}${z}`}>
      <group position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow><cylinderGeometry args={[0.4, 0.4, 0.26, 18]} /><Std color="#25222f" rough={0.95} /></mesh>
        <mesh><cylinderGeometry args={[0.24, 0.24, 0.29, 12]} /><Std color={METAL} metal={0.5} /></mesh>
      </group>
      <Strut from={[Math.sign(x) * 0.55, 0.8, z * 0.86]} to={[x - Math.sign(x) * 0.12, y, z]} radius={0.04} />
    </group>)}
    {/* Tube chassis. */}
    {[-0.55, 0.55].map((x) => <mesh key={x} castShadow position={[x, 0.8, 0]}><boxGeometry args={[0.1, 0.12, 3.1]} /><Std color={SHELL} metal={0.5} /></mesh>)}
    {[-1.4, -0.5, 0.5, 1.4].map((z) => <mesh key={z} castShadow position={[0, 0.8, z]}><boxGeometry args={[1.2, 0.1, 0.1]} /><Std color={SHELL} metal={0.5} /></mesh>)}
    <mesh receiveShadow position={[0, 0.84, -0.1]}><boxGeometry args={[1.05, 0.04, 2.3]} /><Std color={METAL} metal={0.3} /></mesh>
    {/* Seats face forward (-Z), backs toward the rear. */}
    {[-0.3, 0.3].map((x) => <group key={x}>
      <mesh castShadow position={[x, 1.0, -0.15]}><boxGeometry args={[0.44, 0.09, 0.46]} /><Std color={DARK} rough={0.9} /></mesh>
      <mesh castShadow position={[x, 1.3, 0.1]}><boxGeometry args={[0.44, 0.55, 0.08]} /><Std color={DARK} rough={0.9} /></mesh>
    </group>)}
    {/* Control post and T-handle between the seats. */}
    <mesh position={[0, 1.15, -0.75]}><boxGeometry args={[0.06, 0.62, 0.06]} /><Std color={METAL} metal={0.5} /></mesh>
    <mesh position={[0, 1.46, -0.75]}><boxGeometry args={[0.56, 0.06, 0.06]} /><Std color={METAL} metal={0.5} /></mesh>
    {/* Front bumper and rear electronics bay. */}
    <mesh castShadow position={[0, 0.85, -1.6]}><boxGeometry args={[1.5, 0.12, 0.1]} /><Std color={SHELL} metal={0.5} /></mesh>
    <mesh castShadow position={[0, 1.18, 1.15]}><boxGeometry args={[1.15, 0.55, 0.7]} /><Std color={GOLD} metal={0.4} rough={0.5} /></mesh>
    <mesh position={[0, 1.5, 1.15]}><boxGeometry args={[1.0, 0.05, 0.6]} /><Std color={WHITE} /></mesh>
    {/* Mast: forward camera on the left, communications dish aimed up and back on the right. */}
    <Strut from={[-0.5, 1.0, -1.2]} to={[-0.5, 2.0, -1.2]} radius={0.03} />
    <mesh position={[-0.5, 2.05, -1.2]}><boxGeometry args={[0.22, 0.14, 0.14]} /><Std color={DARK} /></mesh>
    <Strut from={[0.45, 1.4, 1.3]} to={[0.45, 2.1, 1.3]} radius={0.03} />
    <group position={[0.45, 2.15, 1.3]} rotation={[0.5, 0, 0]}><Dish radius={0.38} focal={0.22} /></group>
  </group>;
}

export function DomeHabitat() {
  return <group>
    <LevelPad radius={6.2} />
    {/* Regolith berm piled around the foot of the dome. */}
    <mesh castShadow receiveShadow position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.6]}><torusGeometry args={[4.7, 1.15, 8, 28]} /><Std color="#77736b" rough={1} flat /></mesh>
    {/* Geodesic shell with meridian ribs. */}
    <mesh castShadow receiveShadow position={[0, 0.2, 0]}><sphereGeometry args={[4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><Std color="#dcd8e6" rough={0.5} flat /></mesh>
    {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, 0.2, 0]} rotation={[0, (i * Math.PI) / 4, 0]}><torusGeometry args={[4.04, 0.07, 6, 28, Math.PI]} /><Std color={METAL} metal={0.5} /></mesh>)}
    <mesh position={[0, 4.1, 0]}><cylinderGeometry args={[0.85, 1, 0.3, 14]} /><Std color={PURPLE} emissive="#3b2a78" /></mesh>
    {/* Viewports follow the shell. */}
    {[40, 110, 180, 250, 320].map((a) => <group key={a} position={[Math.sin(rad(a)) * 3.66, 1.8, Math.cos(rad(a)) * 3.66]} rotation={[0, rad(a), 0]}>
      <mesh rotation={[-0.42, 0, 0]}><boxGeometry args={[0.9, 0.5, 0.1]} /><meshBasicMaterial color="#ffd8a6" /></mesh>
    </group>)}
    {/* Airlock tunnel toward -Z with an outer hatch and a floodlight. */}
    <group position={[0, 1.25, -4.6]}>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.2, 1.2, 2.6, 16]} /><Std color={WHITE} rough={0.5} /></mesh>
      <mesh position={[0, 0, -1.35]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.95, 0.95, 0.12, 16]} /><Std color={CORAL} emissive="#5a1020" /></mesh>
      <mesh position={[0, 1.3, -1.2]}><boxGeometry args={[0.35, 0.2, 0.25]} /><meshBasicMaterial color="#fff0c8" /></mesh>
    </group>
    <Strut from={[2.6, 3.4, 1]} to={[2.6, 5.6, 1]} radius={0.04} color={WHITE} />
    <mesh position={[2.6, 5.7, 1]}><sphereGeometry args={[0.14, 8, 6]} /><meshBasicMaterial color={CORAL} /></mesh>
  </group>;
}

/** A rigid module lying along X, on four levelling legs; `height` is its axis height above ground. */
function HabModule({ length, radius, height, accent }: { length: number; radius: number; height: number; accent: string }) {
  const half = length / 2;
  return <group>
    <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[radius, radius, length, 24]} /><Std color={WHITE} rough={0.45} metal={0.2} /></mesh>
    {[-1, 1].map((e) => <mesh key={e} castShadow position={[e * half, 0, 0]} scale={[0.3, 1, 1]}><sphereGeometry args={[radius, 20, 12]} /><Std color={SHELL} /></mesh>)}
    {[-0.3, 0.3].map((f) => <mesh key={f} position={[f * length, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[radius * 1.015, radius * 1.015, 0.35, 24]} /><Std color={accent} emissive={accent === CORAL ? "#4a0e1c" : "#24185a"} /></mesh>)}
    {[-1.4, 0.2, 1.8].map((x) => <mesh key={x} position={[x, radius * 0.35, -radius * 0.96]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.7, 0.36, 0.06]} /><meshBasicMaterial color="#ffd8a6" /></mesh>)}
    <mesh castShadow position={[0, radius + 0.1, 0]} rotation={[0.12, 0, 0]}><boxGeometry args={[length * 0.5, 0.07, radius * 1.1]} /><Std color="#d7dcef" metal={0.35} rough={0.3} /></mesh>
    {[-1, 1].map((e) => [-1, 1].map((side) => {
      const x = e * length * 0.32, foot: V3 = [x + e * 0.9, -height + 0.1, side * (radius + 0.9)];
      return <group key={`${e}${side}`}>
        <Strut from={[x, -radius * 0.7, side * radius * 0.7]} to={foot} radius={0.09} />
        <Foot at={[foot[0], -height, foot[2]]} radius={0.45} />
      </group>;
    }))}
  </group>;
}

export function ModularOutpost() {
  const axis = 3.1, hubRadius = 2.1;
  return <group>
    <LevelPad radius={8.6} />
    {/* Central node: vertical cylinder, domed cap, three legs, antenna. */}
    <group position={[0, axis, 0]}>
      <mesh castShadow receiveShadow><cylinderGeometry args={[hubRadius, hubRadius, 4.2, 24]} /><Std color={WHITE} rough={0.45} metal={0.2} /></mesh>
      <mesh castShadow position={[0, 2.1, 0]} scale={[1, 0.35, 1]}><sphereGeometry args={[hubRadius, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><Std color={SHELL} /></mesh>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[hubRadius * 1.015, hubRadius * 1.015, 0.35, 24]} /><Std color={PURPLE} emissive="#24185a" /></mesh>
      {[60, 180, 300].map((a) => {
        const foot: V3 = [Math.sin(rad(a)) * 3.4, -axis + 0.1, Math.cos(rad(a)) * 3.4];
        return <group key={a}><Strut from={[Math.sin(rad(a)) * 1.5, -2, Math.cos(rad(a)) * 1.5]} to={foot} radius={0.1} /><Foot at={[foot[0], -axis, foot[2]]} radius={0.5} /></group>;
      })}
      <Strut from={[0, 2.4, 0]} to={[0, 4.4, 0]} radius={0.05} color={WHITE} />
      <group position={[0, 4.4, 0]} rotation={[-0.4, 0.8, 0]}><group rotation={[-Math.PI / 2, 0, 0]}><Dish radius={0.75} focal={0.45} /></group></group>
    </group>
    {/* Connecting tunnels and the two rigid modules (+X and -Z). */}
    <mesh castShadow position={[hubRadius + 0.4, axis, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.85, 0.85, 1.0, 14]} /><Std color={SHELL} metal={0.3} /></mesh>
    <mesh castShadow position={[0, axis, -hubRadius - 0.4]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.85, 0.85, 1.0, 14]} /><Std color={SHELL} metal={0.3} /></mesh>
    <group position={[hubRadius + 0.9 + 2.75, axis, 0]}><HabModule length={5.5} radius={1.7} height={axis} accent={CORAL} /></group>
    <group position={[0, axis, -(hubRadius + 0.9 + 2.75)]} rotation={[0, Math.PI / 2, 0]}><HabModule length={5.5} radius={1.7} height={axis} accent={PURPLE} /></group>
  </group>;
}

export function InflatableHabitat() {
  const deckY = 1.9, envelopeY = 5.1, envelopeR = 3, stretch = 1.1;
  return <group>
    <LevelPad radius={4.7} />
    {/* Four landing legs braced to a rigid octagonal deck. */}
    {[45, 135, 225, 315].map((a) => {
      const foot: V3 = [Math.sin(rad(a)) * 4.1, 0.1, Math.cos(rad(a)) * 4.1];
      return <group key={a}><Strut from={[Math.sin(rad(a)) * 2.4, deckY - 0.2, Math.cos(rad(a)) * 2.4]} to={foot} radius={0.11} /><Foot at={[foot[0], 0, foot[2]]} radius={0.55} /></group>;
    })}
    <mesh castShadow receiveShadow position={[0, deckY, 0]}><cylinderGeometry args={[3.2, 3.2, 0.5, 8]} /><Std color={SHELL} metal={0.4} /></mesh>
    {/* Soft-goods envelope held by meridian restraint straps and hoop rings. */}
    <mesh castShadow receiveShadow position={[0, envelopeY, 0]} scale={[1, stretch, 1]}><sphereGeometry args={[envelopeR, 32, 20]} /><Std color={FABRIC} rough={0.95} /></mesh>
    {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, envelopeY, 0]} rotation={[0, (i * Math.PI) / 4, 0]} scale={[1, stretch, 1]}><torusGeometry args={[envelopeR + 0.03, 0.06, 6, 40, Math.PI]} /><Std color={METAL} metal={0.3} /></mesh>)}
    {[0, 1.8, -1.8].map((dy) => <mesh key={dy} position={[0, envelopeY + dy, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[Math.sqrt(envelopeR ** 2 - (dy / stretch) ** 2) + 0.03, 0.06, 6, 40]} /><Std color={dy === 0 ? PURPLE : METAL} metal={0.3} /></mesh>)}
    <mesh castShadow position={[0, envelopeY + envelopeR * stretch, 0]}><cylinderGeometry args={[0.8, 1.1, 0.5, 16]} /><Std color={WHITE} metal={0.4} /></mesh>
    <mesh position={[0, envelopeY + envelopeR * stretch + 0.35, 0]}><cylinderGeometry args={[0.45, 0.45, 0.2, 12]} /><Std color={PURPLE} emissive="#3b2a78" /></mesh>
    {/* Airlock with a ladder to the ground. */}
    <mesh castShadow receiveShadow position={[0, deckY + 0.95, -3.6]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1, 1, 2.2, 16]} /><Std color={WHITE} rough={0.5} /></mesh>
    <mesh position={[0, deckY + 0.95, -4.72]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.8, 0.8, 0.1, 14]} /><Std color={CORAL} emissive="#5a1020" /></mesh>
    {[-0.4, 0.4].map((x) => <Strut key={x} from={[x, 0.1, -4.9]} to={[x, deckY + 0.15, -4.4]} radius={0.04} color={METAL} />)}
    {[0.4, 0.85, 1.3, 1.75].map((y, i) => <mesh key={y} position={[0, y, -4.88 + i * 0.13]}><boxGeometry args={[0.8, 0.04, 0.05]} /><Std color={METAL} metal={0.4} /></mesh>)}
  </group>;
}

export function CommsMast({ earthAzimuthDeg, earthElevationDeg }: { earthAzimuthDeg: number; earthElevationDeg: number }) {
  return <group>
    <LevelPad radius={1.8} />
    <Tripod spread={1.5} topY={1.8} radius={0.06} />
    <mesh castShadow position={[0, 3.9, 0]}><cylinderGeometry args={[0.09, 0.14, 7.5, 10]} /><Std color={WHITE} metal={0.4} /></mesh>
    {/* Azimuth turntable, elevation hinge, then the dish facing -Z. */}
    <group position={[0, 7.7, 0]} rotation={[0, -rad(earthAzimuthDeg), 0]}>
      <mesh castShadow><boxGeometry args={[0.5, 0.4, 0.5]} /><Std color={DARK} metal={0.4} /></mesh>
      <group rotation={[rad(Math.max(-5, earthElevationDeg)), 0, 0]}>
        <mesh castShadow position={[0, 0, 0.5]}><boxGeometry args={[0.3, 0.3, 0.5]} /><Std color={DARK} metal={0.4} /></mesh>
        <group position={[0, 0, 0.1]} rotation={[-Math.PI / 2, 0, 0]}><Dish radius={1.3} focal={0.85} /></group>
      </group>
    </group>
    <Strut from={[0.35, 7.5, 0.3]} to={[0.35, 8.9, 0.3]} radius={0.02} color={METAL} />
    <mesh position={[0.35, 9, 0.3]}><sphereGeometry args={[0.1, 8, 6]} /><meshBasicMaterial color={CORAL} /></mesh>
  </group>;
}

export function SurfaceObjectModel({ type, sunAzimuthDeg, sunElevationDeg, earthAzimuthDeg, earthElevationDeg }: { type: SurfaceObjectType; sunAzimuthDeg: number; sunElevationDeg: number; earthAzimuthDeg: number; earthElevationDeg: number }) {
  switch (type) {
    case "solar": return <SolarArray sunAzimuthDeg={sunAzimuthDeg} sunElevationDeg={sunElevationDeg} />;
    case "rover": return <CrewBuggy />;
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

/** Map-scale marker above a placed object so it stays findable from a distance. */
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
