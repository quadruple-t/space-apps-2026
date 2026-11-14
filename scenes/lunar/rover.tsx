/** Procedural low-poly lunar rover companion. */
export function LunarRover({ position = [0, 0, 0], scale = 1 }: { position?: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    {/* Chassis and deck */}
    <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
      <boxGeometry args={[3.8, 0.72, 2.7]} />
      <meshStandardMaterial color="#7560b6" roughness={0.78} flatShading />
    </mesh>
    <mesh position={[0, 1.72, -0.12]} castShadow>
      <boxGeometry args={[2.4, 0.28, 1.55]} />
      <meshStandardMaterial color="#c6c0de" roughness={0.48} metalness={0.25} flatShading />
    </mesh>
    {/* Six rugged wheels */}
    {([-1, 1] as const).flatMap((side) => [-1, 0, 1].map((axle) => <group key={`${side}-${axle}`} position={[side * 2.05, 0.72, axle * 0.78]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.72, 0.72, 0.42, 8]} />
        <meshStandardMaterial color="#332b4a" roughness={0.95} flatShading />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.39, 0.39, 0.44, 6]} />
        <meshStandardMaterial color="#ff637d" metalness={0.3} roughness={0.55} flatShading />
      </mesh>
    </group>))}
    {/* Blue solar wings */}
    {([-1, 1] as const).map((side) => <group key={side} position={[side * 3.15, 1.48, 0]} rotation={[0, 0, side * -0.06]}>
      <mesh castShadow><boxGeometry args={[2.2, 0.12, 1.85]} /><meshStandardMaterial color="#276e9d" metalness={0.45} roughness={0.42} flatShading /></mesh>
      {[-0.58, 0, 0.58].map((row) => <mesh key={row} position={[side * 0.01, 0.075, row]}><boxGeometry args={[2.1, 0.025, 0.035]} /><meshBasicMaterial color="#70d7ff" /></mesh>)}
      {[-0.52, 0, 0.52].map((column) => <mesh key={column} position={[column, 0.075, 0]}><boxGeometry args={[0.025, 0.025, 1.8]} /><meshBasicMaterial color="#70d7ff" /></mesh>)}
    </group>)}
    {/* Camera mast and antenna */}
    <mesh position={[0, 2.35, -0.25]} castShadow><boxGeometry args={[0.18, 1.2, 0.18]} /><meshStandardMaterial color="#dcd7eb" metalness={0.25} flatShading /></mesh>
    <mesh position={[0, 3.02, -0.25]} castShadow><icosahedronGeometry args={[0.48, 1]} /><meshStandardMaterial color="#ff637d" emissive="#6e182e" emissiveIntensity={0.25} flatShading /></mesh>
    <mesh position={[0.72, 2.05, 0.58]} rotation={[Math.PI / 2.6, 0, 0]}><coneGeometry args={[0.32, 0.46, 6]} /><meshStandardMaterial color="#a986ff" metalness={0.2} flatShading /></mesh>
    <mesh position={[0.72, 1.82, 0.6]}><sphereGeometry args={[0.2, 6, 4]} /><meshBasicMaterial color="#58c8ff" /></mesh>
  </group>;
}
