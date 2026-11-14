/** Small, code-built low-poly astronaut used as a scale cue in the lunar scene. */
export function Astronaut({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    {/* Backpack and life-support pack */}
    <mesh position={[0, 1.9, -0.48]} castShadow>
      <boxGeometry args={[1.25, 1.75, 0.56]} />
      <meshStandardMaterial color="#4b3a82" roughness={0.86} flatShading />
    </mesh>
    <mesh position={[0, 2.1, -0.79]} castShadow>
      <boxGeometry args={[0.72, 0.9, 0.14]} />
      <meshStandardMaterial color="#5ac7ff" emissive="#1d4967" emissiveIntensity={0.25} roughness={0.55} flatShading />
    </mesh>

    {/* Suit torso */}
    <mesh position={[0, 2.05, 0]} castShadow>
      <boxGeometry args={[1.45, 1.9, 0.86]} />
      <meshStandardMaterial color="#8873d6" roughness={0.8} flatShading />
    </mesh>
    <mesh position={[0, 2.05, 0.47]}>
      <boxGeometry args={[0.78, 0.78, 0.08]} />
      <meshStandardMaterial color="#e9e7f8" roughness={0.65} flatShading />
    </mesh>
    <mesh position={[0.02, 2.08, 0.53]}>
      <boxGeometry args={[0.28, 0.25, 0.035]} />
      <meshStandardMaterial color="#ff5364" emissive="#6e182e" emissiveIntensity={0.3} roughness={0.5} flatShading />
    </mesh>

    {/* Helmet shell, angular visor and antenna */}
    <mesh position={[0, 3.45, 0.05]} castShadow>
      <icosahedronGeometry args={[0.93, 1]} />
      <meshStandardMaterial color="#eeeafa" roughness={0.32} metalness={0.08} flatShading />
    </mesh>
    <mesh position={[0, 3.43, 0.77]} scale={[0.69, 0.52, 0.2]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#173d66" emissive="#256da2" emissiveIntensity={0.4} metalness={0.35} roughness={0.22} flatShading />
    </mesh>
    <mesh position={[0.48, 3.58, 0.9]} scale={[0.12, 0.07, 0.025]} rotation={[0, 0, -0.45]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#a7e8ff" />
    </mesh>
    <mesh position={[0.63, 4.3, -0.03]} castShadow>
      <cylinderGeometry args={[0.045, 0.07, 0.48, 5]} />
      <meshStandardMaterial color="#ff5364" roughness={0.6} flatShading />
    </mesh>
    <mesh position={[0.63, 4.57, -0.03]}>
      <icosahedronGeometry args={[0.12, 0]} />
      <meshStandardMaterial color="#ff8da0" emissive="#6e182e" emissiveIntensity={0.45} flatShading />
    </mesh>

    {/* Arms: shoulder joints, sleeves and gloves */}
    {([-1, 1] as const).map((side) => <group key={side} position={[side * 0.87, 2.55, 0]} rotation={[0, 0, side * -0.12]}>
      <mesh castShadow position={[side * 0.06, -0.55, 0]} rotation={[0, 0, side * -0.1]}>
        <boxGeometry args={[0.48, 1.15, 0.58]} />
        <meshStandardMaterial color="#7660c1" roughness={0.84} flatShading />
      </mesh>
      <mesh castShadow position={[side * 0.12, -1.18, 0.04]}>
        <dodecahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color="#d4d2df" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[side * 0.06, -0.55, 0.3]}>
        <boxGeometry args={[0.5, 0.18, 0.05]} />
        <meshStandardMaterial color={side < 0 ? "#ff5364" : "#5ac7ff"} roughness={0.5} flatShading />
      </mesh>
    </group>)}

    {/* Hips, segmented legs and boots */}
    <mesh position={[0, 1.05, 0]} castShadow>
      <boxGeometry args={[1.32, 0.52, 0.78]} />
      <meshStandardMaterial color="#5a4b92" roughness={0.9} flatShading />
    </mesh>
    {([-1, 1] as const).map((side) => <group key={side} position={[side * 0.37, 0.78, 0]}>
      <mesh castShadow position={[0, -0.4, 0]}>
        <boxGeometry args={[0.5, 0.9, 0.62]} />
        <meshStandardMaterial color="#c5c3d1" roughness={0.88} flatShading />
      </mesh>
      <mesh castShadow position={[0, -1.02, 0.16]}>
        <boxGeometry args={[0.62, 0.36, 0.92]} />
        <meshStandardMaterial color="#433566" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, -0.73, 0.32]}>
        <boxGeometry args={[0.48, 0.12, 0.05]} />
        <meshStandardMaterial color="#5ac7ff" emissive="#17425c" emissiveIntensity={0.2} flatShading />
      </mesh>
    </group>)}
  </group>;
}
