"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Candidate landing-site marker with sight lines toward the Sun (amber) and
 * Earth (blue). Purely visual — no visibility is computed here.
 */
export function LandingSite({
  position,
  sunDirection,
  earthDirection,
  still,
}: {
  position: THREE.Vector3;
  sunDirection: THREE.Vector3;
  earthDirection: THREE.Vector3;
  still: boolean;
}) {
  const pulse = useRef<THREE.Mesh>(null);

  const { sunLine, earthLine, beam } = useMemo(() => {
    const makeLine = (dir: THREE.Vector3, color: string, length: number) => {
      const start = new THREE.Vector3(0, 1.5, 0);
      const end = dir.clone().multiplyScalar(length).add(start);
      const g = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(
        g,
        new THREE.LineDashedMaterial({ color, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.9, toneMapped: false }),
      );
      line.computeLineDistances();
      return line;
    };
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 38, 0)]);
    return {
      sunLine: makeLine(sunDirection, "#e3ae4f", 260),
      earthLine: makeLine(earthDirection, "#7fa6cf", 260),
      beam: new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: "#ece9e2", transparent: true, opacity: 0.55, toneMapped: false })),
    };
  }, [sunDirection, earthDirection]);

  useFrame((state) => {
    if (still || !pulse.current) return;
    const k = (state.clock.elapsedTime * 0.5) % 1;
    pulse.current.scale.setScalar(1 + k * 2.2);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
  });

  return (
    <group position={position}>
      <primitive object={sunLine} />
      <primitive object={earthLine} />
      <primitive object={beam} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.4}>
        <ringGeometry args={[4.2, 5.4, 48]} />
        <meshBasicMaterial color="#ece9e2" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={pulse} rotation-x={-Math.PI / 2} position-y={0.35}>
        <ringGeometry args={[5.4, 6.1, 48]} />
        <meshBasicMaterial color="#ece9e2" transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
