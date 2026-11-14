"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HERO_SCENE, horizonDirection } from "@/data/hero-scene";
import { CameraRig, type CameraShot } from "./camera-rig";
import { Earth, Starfield, Sun } from "./celestial";
import { LandingSite } from "./landing-site";
import { MAIN_CRATER, createTerrainGeometry, heightAt, type TerrainDetail } from "./terrain";

export type LunarSceneVariant = "hero" | "preview";

export type LunarSceneProps = {
  variant?: LunarSceneVariant;
  /** Render continuously only while visible. */
  active?: boolean;
  /** Freeze camera motion (prefers-reduced-motion). */
  still?: boolean;
  detail?: TerrainDetail;
  onReady?: () => void;
};

const toVec = (d: { x: number; y: number; z: number }) => new THREE.Vector3(d.x, d.y, d.z).normalize();

/** A point on the far rim of the main crater: high ground that catches the Sun. */
function landingSitePosition() {
  const x = MAIN_CRATER.x + 34;
  const z = MAIN_CRATER.z - MAIN_CRATER.r * 0.98;
  return new THREE.Vector3(x, heightAt(x, z) + 0.3, z);
}

function shotFor(variant: LunarSceneVariant): CameraShot {
  if (variant === "preview") {
    const site = landingSitePosition();
    const pos = new THREE.Vector3(site.x + 95, site.y + 70, site.z + 210);
    return { position: pos, target: site.clone().add(new THREE.Vector3(-10, 4, 0)), fov: 40, drift: 7, parallax: 0 };
  }
  const x = 0;
  const z = 12;
  const eye = new THREE.Vector3(x, heightAt(x, z) + 6.5, z);
  const aim = (yaw: number, pitch = -5.5) => toVec(horizonDirection(yaw, pitch)).multiplyScalar(500).add(eye);
  return {
    position: eye,
    target: aim(HERO_SCENE.cameraYawDeg),
    // Portrait: swing toward the Sun so it stays in frame.
    narrowTarget: aim(HERO_SCENE.sunAzimuthDeg + 4, -10),
    fov: 38,
    drift: 3.2,
    parallax: 2.2,
  };
}

/** Shadows are static (fixed Sun, fixed terrain): render the shadow map once. */
function StaticShadows() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [get]);
  return null;
}

function Terrain({ detail }: { detail: TerrainDetail }) {
  const geometry = useMemo(() => createTerrainGeometry(detail), [detail]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.96} metalness={0} />
    </mesh>
  );
}

function SunLight({ direction }: { direction: THREE.Vector3 }) {
  const { light, target } = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(-40, 0, -320);
    const light = new THREE.DirectionalLight("#fff0d6", 5.2);
    light.position.copy(direction).multiplyScalar(950).add(target.position);
    light.target = target;
    light.castShadow = true;
    light.shadow.mapSize.set(4096, 1024);
    const cam = light.shadow.camera;
    cam.left = -560;
    cam.right = 560;
    cam.top = 80;
    cam.bottom = -80;
    cam.near = 1;
    cam.far = 2100;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.6;
    return { light, target };
  }, [direction]);

  return (
    <>
      <primitive object={target} />
      <primitive object={light} />
    </>
  );
}

function SceneContents({ variant, still, detail }: Required<Pick<LunarSceneProps, "variant" | "still" | "detail">>) {
  const sunDir = useMemo(() => toVec(horizonDirection(HERO_SCENE.sunAzimuthDeg, HERO_SCENE.sunElevationDeg)), []);
  const earthDir = useMemo(() => toVec(horizonDirection(HERO_SCENE.earthAzimuthDeg, HERO_SCENE.earthElevationDeg)), []);
  // Light grazes a touch higher than the visible disc so ridgelines read.
  const lightDir = useMemo(() => toVec(horizonDirection(HERO_SCENE.sunAzimuthDeg, HERO_SCENE.sunElevationDeg + 2.4)), []);
  const shot = useMemo(() => shotFor(variant), [variant]);
  const site = useMemo(() => landingSitePosition(), []);

  return (
    <>
      <color attach="background" args={["#050506"]} />
      {/* Earthshine: a faint blue fill so shadowed ground is not pure black. */}
      <hemisphereLight args={["#5d7697", "#000000", 0.85]} />
      <ambientLight intensity={0.04} />
      <SunLight direction={lightDir} />
      <Terrain detail={detail} />
      <Starfield count={detail === "high" ? 1400 : 800} />
      <Sun direction={sunDir} />
      <Earth direction={earthDir} sunDirection={sunDir} />
      {variant === "preview" && (
        <LandingSite position={site} sunDirection={sunDir} earthDirection={earthDir} still={still} />
      )}
      <CameraRig shot={shot} still={still} />
      <StaticShadows />
    </>
  );
}

/**
 * Reusable lunar south-pole scene. Procedural, illustrative geometry —
 * not LOLA-derived terrain.
 */
export default function LunarScene({
  variant = "hero",
  active = true,
  still = false,
  detail = "high",
  onReady,
}: LunarSceneProps) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, detail === "high" ? 1.75 : 1.25]}
      frameloop={active && !still ? "always" : "demand"}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: 38, near: 0.5, far: 3000, position: [0, 10, 12] }}
      onCreated={() => onReady?.()}
      aria-hidden
      tabIndex={-1}
    >
      <SceneContents variant={variant} still={still} detail={detail} />
    </Canvas>
  );
}
