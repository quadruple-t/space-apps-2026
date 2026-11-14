"use client";

import { useMemo, useState, type PointerEvent } from "react";
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

type Props = {
  series: CartesianSeries;
  site: FreeplaySite;
  tMs: number;
  missionStartMs: number;
  missionEndMs: number;
  sunUp: boolean | null;
  earthUp: boolean | null;
  /** Called with a new time (ms) while the user drags the Moon around its orbit. */
  onSeek?: (tMs: number) => void;
};

/** Top-down Earth–Moon diagram in a Sun-fixed frame (sunlight from the right). Not to scale. */
export function OrbitDiagram({ series, site, tMs, missionStartMs, missionEndMs, sunUp, earthUp, onSeek }: Props) {
  const [ref, { width: W, height: H }] = useSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
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
  // Motion arrow from real positions ahead of the Moon; at the end of the data, from behind it.
  const ahead = geomAt(tMs + 10 * 3_600_000), ahead2 = geomAt(tMs + 30 * 3_600_000), behind = geomAt(tMs - 20 * 3_600_000);
  const [A1, A2] = ahead && ahead2 ? [toScreen(ahead.moon), toScreen(ahead2.moon)] : behind ? [toScreen(behind.moon), M] : [M, M];
  const distKm = g.earthDistanceKm;
  const ph = phase(moon);

  // Exact site direction from the ephemeris frame (includes libration).
  const S = { x: M.x + g.site.x * moonR, y: M.y - g.site.y * moonR };
  const farSide = g.siteOnFarSide;

  const rays = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => H * f);

  // Drag-to-scrub: find the time, within half a lunar month of now, whose Moon
  // direction (seen from Earth) best matches the pointer. Coarse hourly pass, then 5-minute refine.
  const moonAngleAt = (t: number) => {
    if (!series.covers(t)) return null;
    const { sun, earth } = series.at(t);
    const p = orbitGeometry(sun, earth, 0, 0).moon;
    return Math.atan2(p.y, p.x);
  };
  const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const timeAtPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const target = Math.atan2(cy - (e.clientY - r.top), e.clientX - r.left - cx);
    const lo = Math.max(missionStartMs, tMs - MONTH_MS / 2), hi = Math.min(missionEndMs, tMs + MONTH_MS / 2);
    const best = (from: number, to: number, step: number) => {
      let bt: number | null = null, bd = Infinity;
      for (let t = from; t <= to; t += step) {
        const a = moonAngleAt(t);
        if (a === null) continue;
        const d = angDiff(a, target);
        if (d < bd) { bd = d; bt = t; }
      }
      return bt;
    };
    const coarse = best(lo, hi, 3_600_000);
    if (coarse === null) return null;
    return best(Math.max(lo, coarse - 3_600_000), Math.min(hi, coarse + 3_600_000), 300_000) ?? coarse;
  };
  const nearOrbit = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.abs(Math.hypot(e.clientX - r.left - cx, e.clientY - r.top - cy) - orbitR) <= Math.max(28, moonR * 2.5);
  };
  const scrub = (e: PointerEvent<SVGSVGElement>) => { const t = timeAtPointer(e); if (t !== null) onSeek?.(t); };

  return <div ref={ref} className="relative h-full w-full">
    <svg width={W} height={H} role="img" className={`block ${onSeek ? (dragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : ""}`}
      onPointerDown={(e) => {
        if (!onSeek || (e.pointerType === "mouse" && e.button !== 0) || !nearOrbit(e)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        scrub(e);
      }}
      onPointerMove={(e) => { if (dragging) scrub(e); }}
      onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setDragging(false); }}
      onPointerCancel={() => setDragging(false)}
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

    <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-1">
      <span className="w-fit rounded border border-retro-red/50 bg-void/80 px-1.5 py-0.5 type-data text-[0.56rem] uppercase tracking-[0.14em] text-bone">Not to scale</span>
      <span className="hidden w-fit rounded bg-void/70 px-1 type-data text-[0.58rem] text-muted-foreground sm:block">Top-down from lunar north · Sun-fixed frame · JPL Horizons via Lunaris360 data{onSeek ? " · drag the Moon along its orbit to change time" : ""}</span>
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
