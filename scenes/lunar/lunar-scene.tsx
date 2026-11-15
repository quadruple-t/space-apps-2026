"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HERO_SCENE, horizonDirection } from "@/data/hero-scene";
import { CameraRig, type CameraMode, type CameraShot } from "./camera-rig";
import { Earth, Starfield, Sun } from "./celestial";
import { LandingSite } from "./landing-site";
import { Astronaut } from "./astronaut";
import { LunarRover } from "./rover";
import { MAIN_CRATER, createTerrainBoundaryGeometry, createTerrainGeometry, heightAt, terrainProfileForSite, type LunarTerrainProfile, type TerrainDetail } from "./terrain";
import type { TerrainSample } from "@/integrations/terrain/moon-samples";
import type { LunarSite } from "@/integrations/science/types";

export type LunarSceneVariant = "hero" | "preview";

export type LunarSceneProps = {
  variant?: LunarSceneVariant;
  /** Render continuously only while visible. */
  active?: boolean;
  /** Freeze camera motion (prefers-reduced-motion). */
  still?: boolean;
  detail?: TerrainDetail;
  onReady?: () => void;
  freeplay?: boolean;
  cameraMode?: CameraMode;
  lookSensitivity?: number;
  landingActive?: boolean;
  /** Omit the buggy that the interactive camera otherwise places beside the player. */
  hideRover?: boolean;
  zoom?: number;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  earthAzimuthDeg?: number;
  earthElevationDeg?: number;
  dataPoints?: TerrainSample[];
  onSelectDataPoint?: (point: TerrainSample) => void;
  selectedSite?: LunarSite;
  onTutorialAction?: (action: "look" | "move") => void;
};

const toVec = (d: { x: number; y: number; z: number }) => new THREE.Vector3(d.x, d.y, d.z).normalize();

/** A point on the far rim of the main crater: high ground that catches the Sun. */
function landingSitePosition(profile: LunarTerrainProfile) {
  const x = MAIN_CRATER.x + 34;
  const z = MAIN_CRATER.z - MAIN_CRATER.r * 0.98;
  return new THREE.Vector3(x, heightAt(x, z, profile) + 0.3, z);
}

function shotFor(variant: LunarSceneVariant, profile: LunarTerrainProfile): CameraShot {
  if (variant === "preview") {
    const site = landingSitePosition(profile);
    const pos = new THREE.Vector3(site.x + 95, site.y + 70, site.z + 210);
    return { position: pos, target: site.clone().add(new THREE.Vector3(-10, 4, 0)), fov: 40, drift: 7, parallax: 0 };
  }
  const x = 0;
  const z = 12;
  const eye = new THREE.Vector3(x, heightAt(x, z, profile) + 6.5, z);
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
function StaticShadows({ refreshKey, terrainKey }: { refreshKey?: THREE.Vector3; terrainKey?: LunarTerrainProfile }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [get, refreshKey, terrainKey]);
  return null;
}

function Terrain({ detail, profile }: { detail: TerrainDetail; profile: LunarTerrainProfile }) {
  const geometry = useMemo(() => createTerrainGeometry(detail, profile), [detail, profile]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.96} metalness={0} />
    </mesh>
  );
}

function TerrainBoundary({ detail, profile }: { detail: TerrainDetail; profile: LunarTerrainProfile }) {
  const geometry = useMemo(() => createTerrainBoundaryGeometry(detail, profile), [detail, profile]);
  useEffect(() => () => { geometry.wall.dispose(); geometry.edge.dispose(); }, [geometry]);
  return <>
    <mesh geometry={geometry.wall} castShadow receiveShadow>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.92} metalness={0} />
    </mesh>
    <lineLoop geometry={geometry.edge}>
      <lineBasicMaterial color="#ff5364" toneMapped={false} />
    </lineLoop>
  </>;
}

const DATA_POINT_POSITIONS: Array<[number, number]> = [[-38, -68], [38, -68], [-38, -142], [38, -142]];
const DATA_POINT_COLORS = ["#a986ff", "#4b9bff", "#ff5364", "#a986ff"];

function TerrainDataMarkers({ points, onSelect, site, profile }: { points: TerrainSample[]; onSelect?: (point: TerrainSample) => void; site: THREE.Vector3 & { latitudeDeg: number; longitudeDeg: number }; profile: LunarTerrainProfile }) {
  return <group>{points.map((point, index) => {
    const [offsetX, offsetZ] = DATA_POINT_POSITIONS[index % DATA_POINT_POSITIONS.length];
    const longitudeDelta = ((point.longitudeDeg - site.longitudeDeg + 540) % 360) - 180;
    const localX = THREE.MathUtils.clamp(offsetX + longitudeDelta * Math.cos(site.latitudeDeg * Math.PI / 180) * 0.6, -70, 70);
    const localZ = THREE.MathUtils.clamp(offsetZ - (point.latitudeDeg - site.latitudeDeg) * 0.9, -70, 20);
    const x = site.x + localX;
    const z = THREE.MathUtils.clamp(site.z + localZ, -650, 0);
    const y = heightAt(x, z, profile);
    const color = DATA_POINT_COLORS[index % DATA_POINT_COLORS.length];
    return <group key={`${point.latitudeDeg}-${point.longitudeDeg}-${index}`} position={[x, y, z]} onClick={(event) => { event.stopPropagation(); onSelect?.(point); }}>
      <mesh position={[0, 3.2, 0]}>
        <octahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={0.35} flatShading />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.18, 0.36, 2.7, 5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <ringGeometry args={[2.2, 2.65, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>;
  })}</group>;
}

function SunLight({ direction }: { direction: THREE.Vector3 }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (targetRef.current && lightRef.current) lightRef.current.target = targetRef.current;
  }, []);
  useEffect(() => {
    if (!targetRef.current || !lightRef.current) return;
    targetRef.current.position.set(-40, 0, -320);
    lightRef.current.position.copy(direction).multiplyScalar(950).add(targetRef.current.position);
    lightRef.current.shadow.needsUpdate = true;
  }, [direction]);
  return <><object3D ref={targetRef} position={[-40, 0, -320]} /><directionalLight ref={lightRef} color="#fff3ea" intensity={5.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={1024} shadow-camera-left={-560} shadow-camera-right={560} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-near={1} shadow-camera-far={2100} shadow-bias={-0.0004} shadow-normalBias={0.6} /></>;
}

function SceneContents({ variant, still, detail, freeplay, cameraMode, zoom, lookSensitivity, sunAzimuthDeg, sunElevationDeg, earthAzimuthDeg, earthElevationDeg, dataPoints, onSelectDataPoint, selectedSite, landingActive, hideRover, onTutorialAction }: Required<Pick<LunarSceneProps, "variant" | "still" | "detail">> & Pick<LunarSceneProps, "freeplay" | "cameraMode" | "lookSensitivity" | "landingActive" | "hideRover" | "zoom" | "sunAzimuthDeg" | "sunElevationDeg" | "earthAzimuthDeg" | "earthElevationDeg" | "dataPoints" | "onSelectDataPoint" | "selectedSite" | "onTutorialAction">) {
  const sunDir = useMemo(() => toVec(horizonDirection(sunAzimuthDeg ?? HERO_SCENE.sunAzimuthDeg, sunElevationDeg ?? HERO_SCENE.sunElevationDeg)), [sunAzimuthDeg, sunElevationDeg]);
  const earthDir = useMemo(() => toVec(horizonDirection(earthAzimuthDeg ?? HERO_SCENE.earthAzimuthDeg, earthElevationDeg ?? HERO_SCENE.earthElevationDeg)), [earthAzimuthDeg, earthElevationDeg]);
  // Light grazes a touch higher than the visible disc so ridgelines read.
  const lightDir = useMemo(() => toVec(horizonDirection(sunAzimuthDeg ?? HERO_SCENE.sunAzimuthDeg, (sunElevationDeg ?? HERO_SCENE.sunElevationDeg) + 2.4)), [sunAzimuthDeg, sunElevationDeg]);
  const terrainProfile = useMemo(() => terrainProfileForSite(freeplay ? selectedSite : undefined), [freeplay, selectedSite]);
  const site = useMemo(
    () => {
      if (!freeplay || !selectedSite) return freeplay ? new THREE.Vector3(0, heightAt(0, 12, terrainProfile), 12) : landingSitePosition(terrainProfile);
      // Each selected coordinate loads a fresh local terrain tile at the
      // player's origin; the geographic coordinates remain in site metadata.
      return new THREE.Vector3(0, heightAt(0, 0, terrainProfile), 0);
    },
    [freeplay, selectedSite, terrainProfile],
  );
  const astronautPosition = useMemo(() => freeplay
    ? new THREE.Vector3(site.x + 7, heightAt(site.x + 7, site.z - 14, terrainProfile), site.z - 14)
    : landingSitePosition(terrainProfile).add(new THREE.Vector3(0, heightAt(0, 28, terrainProfile) - heightAt(0, 0, terrainProfile), 28)), [freeplay, site, terrainProfile]);
  const shot = useMemo(() => {
    if (!freeplay) return shotFor(variant, terrainProfile);
    const eye = site.clone().add(new THREE.Vector3(0, 6.5, 0));
    return { position: eye, target: eye.clone().add(new THREE.Vector3(0, 0, -500)), fov: 55, drift: 0, parallax: 0 };
  }, [freeplay, site, variant, terrainProfile]);

  return (
    <>
      <color attach="background" args={["#080712"]} />
      {/* Earthshine: a faint blue fill so shadowed ground is not pure black. */}
      <hemisphereLight args={["#8a7bc8", "#100d22", 0.85]} />
      <ambientLight intensity={0.04} />
      <SunLight direction={lightDir} />
      <Terrain detail={detail} profile={terrainProfile} />
      <TerrainBoundary detail={detail} profile={terrainProfile} />
      {variant === "preview" && !freeplay && <>
        <Astronaut position={[astronautPosition.x, astronautPosition.y, astronautPosition.z]} scale={1.8} />
        <LunarRover position={[astronautPosition.x - 9, heightAt(astronautPosition.x - 9, astronautPosition.z + 4, terrainProfile) + 0.72, astronautPosition.z + 4]} scale={1.5} />
      </>}
      {freeplay && dataPoints && <TerrainDataMarkers points={dataPoints} onSelect={onSelectDataPoint} site={Object.assign(site.clone(), { latitudeDeg: selectedSite?.latitudeDeg ?? 0, longitudeDeg: selectedSite?.longitudeDeg ?? 0 })} profile={terrainProfile} />}
      <Starfield count={detail === "high" ? 1400 : 800} />
      <Sun direction={sunDir} />
      <Earth direction={earthDir} sunDirection={sunDir} />
      {variant === "preview" && !freeplay && (
        <LandingSite position={site} sunDirection={sunDir} earthDirection={earthDir} still={still} />
      )}
      <CameraRig shot={shot} still={still} mode={cameraMode} interactive={freeplay} zoom={zoom} lookSensitivity={lookSensitivity} orbitTarget={site} landingActive={landingActive} hideRover={hideRover} terrainProfile={terrainProfile} onTutorialAction={onTutorialAction} />
      <StaticShadows refreshKey={lightDir} terrainKey={terrainProfile} />
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
  freeplay = false,
  cameraMode = "first-person",
  lookSensitivity = 1,
  landingActive = false,
  hideRover = false,
  zoom = 1,
  sunAzimuthDeg,
  sunElevationDeg,
  earthAzimuthDeg,
  earthElevationDeg,
  dataPoints,
  onSelectDataPoint,
  selectedSite,
  onTutorialAction,
}: LunarSceneProps) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, detail === "high" ? 1.75 : 1.25]}
      frameloop={active && !still ? "always" : "demand"}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: 38, near: 0.5, far: 3000, position: [0, 10, 12] }}
      onCreated={({ gl }) => { gl.domElement.style.touchAction = "none"; onReady?.(); }}
      aria-hidden
      tabIndex={-1}
    >
      <SceneContents variant={variant} still={still} detail={detail} freeplay={freeplay} cameraMode={cameraMode} zoom={zoom} lookSensitivity={lookSensitivity} sunAzimuthDeg={sunAzimuthDeg} sunElevationDeg={sunElevationDeg} earthAzimuthDeg={earthAzimuthDeg} earthElevationDeg={earthElevationDeg} dataPoints={dataPoints} onSelectDataPoint={onSelectDataPoint} selectedSite={selectedSite} landingActive={landingActive} hideRover={hideRover} onTutorialAction={onTutorialAction} />
    </Canvas>
  );
}
