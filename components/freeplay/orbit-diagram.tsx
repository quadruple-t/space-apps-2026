"use client";

import { useMemo } from "react";
import type { CartesianSeries } from "@/lib/ephemeris";
import { orbitGeometry, phase, type OrbitGeometry } from "@/lib/orbit";
import type { FreeplaySite } from "@/data/sites";
import { useSize } from "./use-size";

const SUN = "#ff5364";
const EARTH = "#4b9bff";
const INK = "#f0ebf7";
const MUTED = "#b2abc4";
const MEAN_EARTH_MOON_KM = 384_400;
const MONTH_MS = 29.530589 * 86_400_000;
const TRANSFER_MS = 72 * 3_600_000;

function quadraticPoint(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, t: number) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
}

type Props = {
  series: CartesianSeries;
  site: FreeplaySite;
  tMs: number;
  missionStartMs: number;
  missionEndMs: number;
  sunUp: boolean | null;
  earthUp: boolean | null;
};

/** Top-down Earth–Moon diagram in a Sun-fixed frame (sunlight from the right). Not to scale. */
export function OrbitDiagram({ series, site, tMs, missionStartMs, missionEndMs, sunUp, earthUp }: Props) {
  const [ref, { width: W, height: H }] = useSize<HTMLDivElement>();
  const cx = W * 0.44, cy = H / 2;
  const orbitR = Math.min(W * 0.36, H * 0.4);
  const earthR = Math.max(16, orbitR * 0.14), moonR = Math.max(9, orbitR * 0.07);

  const toScreen = (p: { x: number; y: number }) => {
    const d = Math.hypot(p.x, p.y) || 1;
    const r = orbitR * (d / MEAN_EARTH_MOON_KM);
    return { x: cx + (p.x / d) * r, y: cy - (p.y / d) * r };
  };
  const geomAt = (t: number): OrbitGeometry | null => {
    if (!series.covers(t)) return null;
    const { sun, earth } = series.at(t);
    return orbitGeometry(sun, earth, site.latitudeDeg, site.longitudeDeg);
  };

  // Orbit trace in the Sun frame: the whole mission, or for long missions one
  // lunar month around now (re-centred every 6 h) so a year isn't 12 overlaid loops.
  const longMission = missionEndMs - missionStartMs > MONTH_MS;
  const centre = longMission ? Math.round(tMs / 21_600_000) * 21_600_000 : 0;
  const trace = useMemo(() => {
    const a = longMission ? Math.max(missionStartMs, Math.min(missionEndMs - MONTH_MS, centre - MONTH_MS / 2)) : missionStartMs;
    const span = longMission ? MONTH_MS : missionEndMs - missionStartMs;
    const n = Math.min(240, Math.max(24, Math.round(span / 3_600_000)));
    const pts: string[] = [];
    for (let k = 0; k <= n; k++) {
      const t = a + (span * k) / n;
      if (!series.covers(t)) continue;
      const { sun, earth } = series.at(t);
      const p = orbitGeometry(sun, earth, 0, 0).moon, d = Math.hypot(p.x, p.y), r = orbitR * (d / MEAN_EARTH_MOON_KM);
      pts.push(`${(cx + (p.x / d) * r).toFixed(1)},${(cy - (p.y / d) * r).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [series, missionStartMs, missionEndMs, orbitR, cx, cy, longMission, centre]);

  const g = geomAt(tMs);
  if (!g) return <div ref={ref} className="h-full w-full" />;
  const moon = g.moon;
  const M = toScreen(moon);
  const arrivalGeometry = geomAt(missionStartMs + TRANSFER_MS);
  const arrivalMoon = arrivalGeometry ? toScreen(arrivalGeometry.moon) : M;
  const arrivalDx = arrivalMoon.x - cx;
  const arrivalDy = arrivalMoon.y - cy;
  const arrivalLength = Math.hypot(arrivalDx, arrivalDy) || 1;
  const transferStart = { x: cx + (arrivalDx / arrivalLength) * (earthR + 4), y: cy + (arrivalDy / arrivalLength) * (earthR + 4) };
  const transferEnd = arrivalMoon;
  const transferControl = {
    x: (transferStart.x + transferEnd.x) / 2 - (arrivalDy / arrivalLength) * orbitR * 0.24,
    y: (transferStart.y + transferEnd.y) / 2 + (arrivalDx / arrivalLength) * orbitR * 0.24,
  };
  const flightProgress = Math.max(0, Math.min(1, (tMs - missionStartMs) / TRANSFER_MS));
  const rocket = quadraticPoint(transferStart, transferControl, transferEnd, flightProgress);
  const rocketAhead = quadraticPoint(transferStart, transferControl, transferEnd, Math.min(1, flightProgress + 0.002));
  const rocketAngle = Math.atan2(rocketAhead.y - rocket.y, rocketAhead.x - rocket.x) * 180 / Math.PI;
  // Motion arrow from real positions ahead of the Moon; at the end of the data, from behind it.
  const ahead = geomAt(tMs + 10 * 3_600_000), ahead2 = geomAt(tMs + 30 * 3_600_000), behind = geomAt(tMs - 20 * 3_600_000);
  const [A1, A2] = ahead && ahead2 ? [toScreen(ahead.moon), toScreen(ahead2.moon)] : behind ? [toScreen(behind.moon), M] : [M, M];
  const distKm = g.earthDistanceKm;
  const ph = phase(moon);

  // Exact site direction from the ephemeris frame (includes libration).
  const S = { x: M.x + g.site.x * moonR, y: M.y - g.site.y * moonR };
  const farSide = g.siteOnFarSide;

  const rays = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => H * f);

  return <div ref={ref} className="relative h-full w-full">
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[70%] border border-retro-purple/35 bg-void/80 px-3 py-2 backdrop-blur-sm">
      <p className="type-data text-[0.6rem] uppercase tracking-[0.14em] text-retro-purple">Concept 72h transfer · {site.name}</p>
      <p className="type-data mt-1 text-[0.56rem] text-bone/60">{Math.round(flightProgress * 100)}% in flight · scrub mission clock · illustrative, not a flight plan</p>
    </div>
    <svg width={W} height={H} role="img" className="block"
      aria-label={`Earth-Moon orbit diagram, not to scale. A conceptual 72-hour rocket transfer is ${Math.round(flightProgress * 100)} percent complete. Sunlight from the right. Moon ${(distKm / 1000).toFixed(0)} thousand km from Earth, ${ph.name}. Selected site ${sunUp ? "in daylight" : "in darkness"}${earthUp === null ? "" : earthUp ? ", Earth above its horizon" : ", Earth below its horizon"}.`}>
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

      {/* Conceptual Earth-to-Moon transfer. The timeline advances the vehicle along a 72-hour arc. */}
      <path d={`M${transferStart.x},${transferStart.y} Q${transferControl.x},${transferControl.y} ${transferEnd.x},${transferEnd.y}`} fill="none" stroke="#b99aff" strokeOpacity="0.85" strokeWidth="2" strokeDasharray="5 5" />
      <path d={`M${transferStart.x},${transferStart.y} Q${transferControl.x},${transferControl.y} ${rocket.x},${rocket.y}`} fill="none" stroke="#ff5364" strokeOpacity="0.9" strokeWidth="2.5" />
      <g transform={`translate(${rocket.x} ${rocket.y}) rotate(${rocketAngle})`} aria-hidden="true">
        <circle r="8" fill="#100c1a" stroke="#ff5364" strokeWidth="1.5" />
        <path d="M-4 0 L2 -3.5 L5 0 L2 3.5 Z M-4 -2 L-7 -4 L-6 0 M-4 2 L-7 4 L-6 0" fill="#f0ebf7" stroke="#ff5364" strokeWidth="0.8" />
        <path d="M-7 -1.5 L-10 0 L-7 1.5" fill="none" stroke="#ff9a66" strokeWidth="1.5" />
      </g>
      <text x={transferStart.x} y={transferStart.y + 17} textAnchor="middle" fill={INK} fontSize="8" letterSpacing="1" fontFamily="var(--font-plex-mono), monospace">DEPART</text>
      <text x={transferEnd.x} y={transferEnd.y - moonR - 18} textAnchor="middle" fill={INK} fontSize="8" letterSpacing="1" fontFamily="var(--font-plex-mono), monospace">ARRIVAL</text>

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

    <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-1">
      <span className="w-fit rounded border border-retro-red/50 bg-void/80 px-1.5 py-0.5 type-data text-[0.56rem] uppercase tracking-[0.14em] text-bone">Not to scale</span>
      <span className="hidden w-fit rounded bg-void/70 px-1 type-data text-[0.58rem] text-muted-foreground sm:block">Top-down from lunar north · Sun-fixed frame · JPL Horizons via Lunaris360 data</span>
    </div>
    <div className="pointer-events-none absolute bottom-3 left-3 mr-3 grid gap-0.5 rounded bg-void/75 px-1.5 py-1 type-data text-[0.6rem] text-muted-foreground">
      <span><span className="text-bone">{ph.name}</span> · {(ph.illuminated * 100).toFixed(0)}% lit from Earth</span>
      <span>Earth–Moon {Math.round(distKm).toLocaleString("en-US")} km</span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-2 rounded-full border" style={{ background: sunUp ? SUN : "#080712", borderColor: sunUp ? "#fff2f5" : INK }} />
        {site.name}: {sunUp === null ? "loading…" : sunUp ? "☀ in daylight" : "☾ in darkness"}{farSide ? " (southern hemisphere, seen through the Moon)" : ""}
      </span>
    </div>
  </div>;
}
