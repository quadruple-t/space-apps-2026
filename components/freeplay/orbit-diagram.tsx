"use client";

import { useMemo } from "react";
import { phase, siteAngle, toSunFrame, vectorAt } from "@/lib/orbit";
import type { OrbitVectors } from "@/lib/use-horizons";
import type { FreeplaySite } from "@/data/sites";
import { useSize } from "./use-size";

const SUN = "#ff5364";
const EARTH = "#4b9bff";
const INK = "#f0ebf7";
const MUTED = "#b2abc4";
const MEAN_EARTH_MOON_KM = 384_400;

type Props = {
  vectors: OrbitVectors;
  site: FreeplaySite;
  tMs: number;
  missionStartMs: number;
  missionEndMs: number;
  sunUp: boolean | null;
  earthUp: boolean | null;
};

/** Top-down Earth–Moon diagram in a Sun-fixed frame (sunlight from the right). Not to scale. */
export function OrbitDiagram({ vectors, site, tMs, missionStartMs, missionEndMs, sunUp, earthUp }: Props) {
  const [ref, { width: W, height: H }] = useSize<HTMLDivElement>();
  const cx = W * 0.44, cy = H / 2;
  const orbitR = Math.min(W * 0.36, H * 0.4);
  const earthR = Math.max(16, orbitR * 0.14), moonR = Math.max(9, orbitR * 0.07);

  const toScreen = (p: { x: number; y: number }) => {
    const d = Math.hypot(p.x, p.y) || 1;
    const r = orbitR * (d / MEAN_EARTH_MOON_KM);
    return { x: cx + (p.x / d) * r, y: cy - (p.y / d) * r };
  };
  const moonAt = (t: number) => {
    const m = vectorAt(vectors.moon, t), s = vectorAt(vectors.sun, t);
    return m && s ? toSunFrame(m, s) : null;
  };

  // Mission-window trace in the Sun frame (at most ~360 points).
  const trace = useMemo(() => {
    const span = missionEndMs - missionStartMs, n = Math.min(360, Math.max(24, Math.round(span / 3_600_000)));
    const pts: string[] = [];
    for (let k = 0; k <= n; k++) {
      const m = vectorAt(vectors.moon, missionStartMs + (span * k) / n), s = vectorAt(vectors.sun, missionStartMs + (span * k) / n);
      if (!m || !s) continue;
      const p = toSunFrame(m, s), d = Math.hypot(p.x, p.y), r = orbitR * (d / MEAN_EARTH_MOON_KM);
      pts.push(`${(cx + (p.x / d) * r).toFixed(1)},${(cy - (p.y / d) * r).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [vectors, missionStartMs, missionEndMs, orbitR, cx, cy]);

  const moon = moonAt(tMs);
  if (!moon) return <div ref={ref} className="h-full w-full" />;
  const M = toScreen(moon);
  const ahead = moonAt(tMs + 10 * 3_600_000), ahead2 = moonAt(tMs + 30 * 3_600_000);
  const A1 = ahead ? toScreen(ahead) : M, A2 = ahead2 ? toScreen(ahead2) : M;
  const distKm = Math.hypot(moon.x, moon.y);
  const ph = phase(moon);

  const theta = siteAngle(moon, site.longitudeDeg);
  const rr = moonR * Math.cos((site.latitudeDeg * Math.PI) / 180);
  const S = { x: M.x + Math.cos(theta) * rr, y: M.y - Math.sin(theta) * rr };
  const farSide = site.latitudeDeg < 0;

  const rays = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => H * f);

  return <div ref={ref} className="relative h-full w-full">
    <svg width={W} height={H} role="img" className="block"
      aria-label={`Orbit diagram, not to scale. Sunlight from the right. Moon ${(distKm / 1000).toFixed(0)} thousand km from Earth, ${ph.name}. Selected site ${sunUp ? "in daylight" : "in darkness"}${earthUp === null ? "" : earthUp ? ", Earth above its horizon" : ", Earth below its horizon"}.`}>
      <defs>
        <marker id="fp-arrow-sun" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill={SUN} /></marker>
        <marker id="fp-arrow-orbit" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill={INK} /></marker>
        <clipPath id="fp-earth-clip"><circle cx={cx} cy={cy} r={earthR} /></clipPath>
        <clipPath id="fp-moon-clip"><circle cx={M.x} cy={M.y} r={moonR} /></clipPath>
      </defs>

      {/* Sunlight: parallel rays from the right */}
      {rays.map((y, i) => <line key={i} x1={W - 12} y1={y} x2={W - Math.min(150, W * 0.16)} y2={y} stroke={SUN} strokeOpacity="0.75" strokeWidth="1.5" markerEnd="url(#fp-arrow-sun)" />)}
      <text x={W - 14} y={H * 0.2 - 10} textAnchor="end" fill={INK} fontSize="10" letterSpacing="1.5" fontFamily="var(--font-plex-mono), monospace">SUNLIGHT →</text>

      {/* Orbit guide and mission trace */}
      <circle cx={cx} cy={cy} r={orbitR} fill="none" stroke={MUTED} strokeOpacity="0.25" strokeDasharray="3 6" />
      {trace && <polyline points={trace} fill="none" stroke={INK} strokeOpacity="0.55" strokeWidth="1.5" />}
      {(A1.x !== M.x || A1.y !== M.y) && <path d={`M${A1.x.toFixed(1)},${A1.y.toFixed(1)}L${A2.x.toFixed(1)},${A2.y.toFixed(1)}`} stroke={INK} strokeWidth="1.5" markerEnd="url(#fp-arrow-orbit)" />}

      {/* Earth: lit half faces the Sun */}
      <circle cx={cx} cy={cy} r={earthR} fill="#13254a" />
      <rect x={cx} y={cy - earthR} width={earthR} height={earthR * 2} fill={EARTH} clipPath="url(#fp-earth-clip)" />
      <circle cx={cx} cy={cy} r={earthR} fill="none" stroke={EARTH} strokeWidth="1.5" />
      <text x={cx} y={cy + earthR + 16} textAnchor="middle" fill={INK} fontSize="10" letterSpacing="1.5" fontFamily="var(--font-plex-mono), monospace">EARTH</text>

      {/* Line of sight site → Earth when Earth is above the site's horizon */}
      {earthUp && <line x1={S.x} y1={S.y} x2={cx} y2={cy} stroke={EARTH} strokeOpacity="0.6" strokeDasharray="2 4" />}

      {/* Moon: lit half faces the Sun */}
      <circle cx={M.x} cy={M.y} r={moonR} fill="#2a2640" />
      <rect x={M.x} y={M.y - moonR} width={moonR} height={moonR * 2} fill="#d9d4ea" clipPath="url(#fp-moon-clip)" />
      <circle cx={M.x} cy={M.y} r={moonR} fill="none" stroke={MUTED} strokeWidth="1" />

      {/* Site marker */}
      <circle cx={S.x} cy={S.y} r="3.6" fill={sunUp ? SUN : "#080712"} stroke={sunUp ? "#fff2f5" : INK} strokeWidth="1.5" strokeDasharray={farSide ? "1.5 1.5" : undefined} />
      <text x={M.x} y={M.y - moonR - 9} textAnchor="middle" fill={INK} fontSize="10" letterSpacing="1.5" fontFamily="var(--font-plex-mono), monospace">MOON</text>
    </svg>

    <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
      <span className="w-fit rounded border border-retro-red/50 bg-void/80 px-1.5 py-0.5 type-data text-[0.56rem] uppercase tracking-[0.14em] text-bone">Not to scale</span>
      <span className="type-data text-[0.58rem] text-muted-foreground">Top-down, ecliptic north up · Sun-fixed frame · site position ±8° (libration)</span>
    </div>
    <div className="pointer-events-none absolute bottom-3 left-3 grid gap-0.5 type-data text-[0.6rem] text-muted-foreground">
      <span><span className="text-bone">{ph.name}</span> · {(ph.illuminated * 100).toFixed(0)}% lit from Earth</span>
      <span>Earth–Moon {Math.round(distKm).toLocaleString("en-US")} km</span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-2 rounded-full border" style={{ background: sunUp ? SUN : "#080712", borderColor: sunUp ? "#fff2f5" : INK }} />
        {site.name}: {sunUp === null ? "loading…" : sunUp ? "☀ in daylight" : "☾ in darkness"}{farSide ? " (southern hemisphere, seen through the Moon)" : ""}
      </span>
    </div>
  </div>;
}
