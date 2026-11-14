"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { seededRandom } from "@/lib/noise";

export const SKY_DISTANCE = 1300;

function radialTexture(stops: Array<[number, string]>, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Low Sun: hard core, warm bloom and a faint anamorphic streak. */
export function Sun({ direction }: { direction: THREE.Vector3 }) {
  const { position, core, glow, streak } = useMemo(() => {
    const spriteMat = (map: THREE.Texture, opacity = 1) =>
      new THREE.SpriteMaterial({
        map,
        opacity,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    return {
      position: direction.clone().multiplyScalar(SKY_DISTANCE),
      core: spriteMat(
        radialTexture([
          [0, "rgba(255,255,250,1)"],
          [0.35, "rgba(255,246,225,1)"],
          [0.6, "rgba(255,214,140,0.5)"],
          [1, "rgba(255,190,90,0)"],
        ]),
      ),
      glow: spriteMat(
        radialTexture([
          [0, "rgba(255,226,170,0.85)"],
          [0.08, "rgba(240,180,90,0.45)"],
          [0.3, "rgba(227,174,79,0.12)"],
          [1, "rgba(227,174,79,0)"],
        ]),
        0.9,
      ),
      streak: spriteMat(
        radialTexture([
          [0, "rgba(255,220,160,0.6)"],
          [0.4, "rgba(227,174,79,0.12)"],
          [1, "rgba(227,174,79,0)"],
        ]),
        0.45,
      ),
    };
  }, [direction]);

  return (
    <group position={position}>
      <sprite material={glow} scale={[300, 300, 1]} renderOrder={1} />
      <sprite material={streak} scale={[1100, 12, 1]} renderOrder={1} />
      <sprite material={core} scale={[30, 30, 1]} renderOrder={2} />
    </group>
  );
}

const earthVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vObj;
  varying vec3 vWorldPos;
  void main() {
    vObj = normal;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFragment = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vWorldNormal;
  varying vec3 vObj;
  varying vec3 vWorldPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float land = smoothstep(0.53, 0.6, fbm(vObj * 2.3 + 4.0));
    float clouds = smoothstep(0.5, 0.78, fbm(vObj * 4.5 + 11.0));
    vec3 ocean = vec3(0.05, 0.13, 0.30);
    vec3 ground = vec3(0.30, 0.29, 0.20);
    vec3 albedo = mix(mix(ocean, ground, land), vec3(0.92), clouds * 0.85);

    float ndl = dot(N, normalize(uSunDir));
    float day = smoothstep(-0.04, 0.3, ndl);
    vec3 color = albedo * day * 1.9;

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    color += vec3(0.32, 0.58, 1.0) * fres * smoothstep(-0.25, 0.35, ndl) * 1.4;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Earth with a physically consistent phase: lit from the scene's Sun direction. */
export function Earth({
  direction,
  sunDirection,
  angularDiameterDeg = 2.2,
}: {
  direction: THREE.Vector3;
  sunDirection: THREE.Vector3;
  angularDiameterDeg?: number;
}) {
  const position = useMemo(() => direction.clone().multiplyScalar(SKY_DISTANCE), [direction]);
  const radius = SKY_DISTANCE * Math.tan(((angularDiameterDeg / 2) * Math.PI) / 180);
  const uniforms = useMemo(() => ({ uSunDir: { value: sunDirection.clone() } }), [sunDirection]);

  return (
    <mesh position={position} rotation={[0.35, -0.6, 0.41]}>
      <sphereGeometry args={[radius, 48, 32]} />
      <shaderMaterial
        vertexShader={earthVertex}
        fragmentShader={earthFragment}
        uniforms={uniforms}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Faint starfield above the horizon. */
export function Starfield({ count = 1400 }: { count?: number }) {
  const geometry = useMemo(() => {
    const rand = seededRandom(42);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Uniform on the upper hemisphere.
      const u = rand();
      const theta = rand() * Math.PI * 2;
      const y = 0.015 + u * 0.985;
      const r = Math.sqrt(1 - y * y);
      const d = SKY_DISTANCE * 1.3;
      positions.set([Math.cos(theta) * r * d, y * d, Math.sin(theta) * r * d], i * 3);
      const b = 0.25 + Math.pow(rand(), 3) * 0.75;
      const warm = rand() > 0.85;
      colors.set(warm ? [b, b * 0.9, b * 0.75] : [b * 0.9, b * 0.95, b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);

  return (
    <points geometry={geometry} renderOrder={-1}>
      <pointsMaterial
        size={1.6}
        sizeAttenuation={false}
        vertexColors
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
