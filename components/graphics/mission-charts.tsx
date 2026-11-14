"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { DaySummary, Sample, Timeline } from "@/lib/illumination";

const SUN = "#ff5364";
const EARTH = "#4b9bff";
const GRID = "#302c4a";
const INK_MUTED = "#b2abc4";
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmtDateTime = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 190);
  return <div className="pointer-events-none absolute top-2 z-10 w-[180px] rounded border border-line bg-popover/95 px-2.5 py-2 text-[0.62rem] leading-relaxed text-bone shadow-lg" style={{ left }}>{children}</div>;
}

function XAxis({ t0, t1, x, y }: { t0: number; t1: number; x: (t: number) => number; y: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f);
  return <g fill={INK_MUTED} fontSize="9" fontFamily="var(--font-mono, monospace)">
    {ticks.map((t, i) => <text key={i} x={x(t)} y={y + 15} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{fmtDate(t).slice(5)}</text>)}
  </g>;
}

/** Hours of sunlight per 24 h window. One series: the chart title names it, no legend. */
export function DailySunlightChart({ days, cursorT, onSeek, height = 170 }: {
  days: DaySummary[]; cursorT: number; onSeek: (t: number) => void; height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!days.length) return null;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / days.length;
  const gap = slot >= 6 ? 2 : 0;
  const barW = Math.max(1, slot - gap);
  const y = (h: number) => PAD.top + plotH - (h / 24) * plotH;
  const t0 = days[0].dayStart, t1 = days.at(-1)!.dayStart + 86_400_000;
  const xT = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
  const cursorDay = Math.floor((cursorT - t0) / 86_400_000);
  const r = Math.min(4, barW / 2);

  const dayAt = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - PAD.left) / slot);
    return i >= 0 && i < days.length ? i : null;
  };

  return <div ref={ref} className="relative">
    <svg width={width} height={height} role="img" aria-label={`Sunlight hours per day across ${days.length} days`} className="block cursor-crosshair touch-none"
      onPointerMove={(e) => setHover(dayAt(e))} onPointerLeave={() => setHover(null)}
      onClick={(e) => { const i = dayAt(e); if (i !== null) onSeek(days[i].dayStart); }}>
      {[0, 6, 12, 18, 24].map((h) => <g key={h}>
        <line x1={PAD.left} x2={width - PAD.right} y1={y(h)} y2={y(h)} stroke={GRID} strokeWidth="1" />
        <text x={PAD.left - 6} y={y(h) + 3} textAnchor="end" fill={INK_MUTED} fontSize="9" fontFamily="var(--font-mono, monospace)">{h}h</text>
      </g>)}
      {days.map((d, i) => {
        if (d.sunlightHours <= 0) return null;
        const x = PAD.left + i * slot + gap / 2;
        const top = y(d.sunlightHours), base = y(0);
        const rr = Math.min(r, base - top);
        const path = `M${x},${base}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + barW - rr}Q${x + barW},${top} ${x + barW},${top + rr}V${base}Z`;
        const active = i === cursorDay || i === hover;
        return <path key={i} d={path} fill={SUN} opacity={active ? 1 : 0.6} />;
      })}
      <line x1={xT(cursorT)} x2={xT(cursorT)} y1={PAD.top} y2={y(0)} stroke="#f0ebf7" strokeWidth="1.5" />
      <XAxis t0={t0} t1={t1} x={xT} y={y(0)} />
    </svg>
    {hover !== null && <Tooltip x={PAD.left + hover * slot} width={width}>
      <div className="type-data text-muted-foreground">{fmtDate(days[hover].dayStart)} · day {hover + 1}</div>
      <div><span style={{ color: SUN }}>●</span> Sunlight {days[hover].sunlightHours.toFixed(0)} h</div>
      <div><span style={{ color: EARTH }}>○</span> Earth visible {days[hover].earthHours.toFixed(0)} h</div>
      <div>Peak {days[hover].peakIrradiance.toFixed(0)} W/m²</div>
      <div>Energy {days[hover].energyKWh.toFixed(2)} kWh/m²</div>
      <div className="mt-1 text-muted-foreground">Click to jump here</div>
    </Tooltip>}
  </div>;
}

/** Solar intensity on the panel over time. Per pixel column it draws the hourly maximum. */
export function IrradianceChart({ samples, timeline, cursorT, onSeek, height = 170 }: {
  samples: Sample[]; timeline: Timeline; cursorT: number; onSeek: (t: number) => void; height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);
  if (samples.length < 2) return null;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const t0 = samples[0].t, t1 = samples.at(-1)!.t;
  let peak = 0;
  for (const w of timeline.irradiance) peak = Math.max(peak, w);
  const yMax = niceMax(peak * 1.05);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (w: number) => PAD.top + plotH - (w / yMax) * plotH;

  const cols = Math.max(2, Math.min(samples.length, Math.round(plotW)));
  const colMax = new Float64Array(cols);
  for (let i = 0; i < samples.length; i++) {
    const c = Math.min(cols - 1, Math.floor(((samples[i].t - t0) / (t1 - t0)) * cols));
    colMax[c] = Math.max(colMax[c], timeline.irradiance[i]);
  }
  const pts = [...colMax].map((w, c) => `${(PAD.left + (c / (cols - 1)) * plotW).toFixed(1)},${y(w).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  const area = `${line}L${PAD.left + plotW},${y(0)}L${PAD.left},${y(0)}Z`;

  const indexAt = (px: number) => {
    const t = t0 + ((px - PAD.left) / plotW) * (t1 - t0);
    return Math.max(0, Math.min(samples.length - 1, Math.round((t - t0) / (timeline.stepHours * 3_600_000))));
  };
  const hoverIdx = hoverX === null ? null : indexAt(hoverX);
  const ticks = [0, 0.5, 1].map((f) => yMax * f);

  return <div ref={ref} className="relative">
    <svg width={width} height={height} role="img" aria-label={`Solar intensity on the panel, peak ${peak.toFixed(0)} watts per square metre`} className="block cursor-crosshair touch-none"
      onPointerMove={(e) => { const px = e.clientX - e.currentTarget.getBoundingClientRect().left; setHoverX(px >= PAD.left && px <= PAD.left + plotW ? px : null); }}
      onPointerLeave={() => setHoverX(null)}
      onClick={(e) => { const px = e.clientX - e.currentTarget.getBoundingClientRect().left; onSeek(samples[indexAt(px)].t); }}>
      {ticks.map((w) => <g key={w}>
        <line x1={PAD.left} x2={width - PAD.right} y1={y(w)} y2={y(w)} stroke={GRID} strokeWidth="1" />
        <text x={PAD.left - 6} y={y(w) + 3} textAnchor="end" fill={INK_MUTED} fontSize="9" fontFamily="var(--font-mono, monospace)">{w >= 1000 ? `${(w / 1000).toFixed(1)}k` : w.toFixed(0)}</text>
      </g>)}
      <path d={area} fill={SUN} fillOpacity="0.16" />
      <path d={line} fill="none" stroke={SUN} strokeWidth="2" strokeLinejoin="round" />
      <line x1={x(cursorT)} x2={x(cursorT)} y1={PAD.top} y2={y(0)} stroke="#f0ebf7" strokeWidth="1.5" />
      {hoverIdx !== null && <>
        <line x1={x(samples[hoverIdx].t)} x2={x(samples[hoverIdx].t)} y1={PAD.top} y2={y(0)} stroke={INK_MUTED} strokeDasharray="2 3" />
        <circle cx={x(samples[hoverIdx].t)} cy={y(timeline.irradiance[hoverIdx])} r="4" fill={SUN} stroke="#080712" strokeWidth="2" />
      </>}
      <XAxis t0={t0} t1={t1} x={x} y={y(0)} />
    </svg>
    {hoverIdx !== null && <Tooltip x={x(samples[hoverIdx].t)} width={width}>
      <div className="type-data text-muted-foreground">{fmtDateTime(samples[hoverIdx].t)}</div>
      <div><span style={{ color: SUN }}>●</span> {timeline.irradiance[hoverIdx].toFixed(1)} W/m²</div>
      <div>Sun elevation {samples[hoverIdx].sunEl.toFixed(2)}°</div>
      <div className="mt-1 text-muted-foreground">Click to jump here</div>
    </Tooltip>}
  </div>;
}

/**
 * Horizon view: azimuth (x) vs elevation (y) as seen from the site.
 * Shows the Sun's track over the trailing window plus current Sun and Earth.
 */
export function SkyTrack({ samples, index, current, trailHours = 24, height = 200 }: {
  samples: Sample[]; index: number; current: Sample; trailHours?: number; height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  let lo = 0, hi = 2;
  for (const s of samples) { lo = Math.min(lo, s.sunEl, s.earthEl); hi = Math.max(hi, s.sunEl, s.earthEl); }
  const yMin = Math.max(-15, Math.floor(lo) - 1), yMax = Math.min(90, Math.ceil(hi) + 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (az: number) => PAD.left + (az / 360) * plotW;
  const y = (el: number) => PAD.top + plotH - ((Math.max(yMin, Math.min(yMax, el)) - yMin) / (yMax - yMin)) * plotH;

  const stepH = samples.length > 1 ? (samples[1].t - samples[0].t) / 3_600_000 : 1;
  const i1 = Math.floor(index), i0 = Math.max(0, i1 - Math.round(trailHours / stepH));
  const segs: string[][] = [[]];
  for (let i = i0; i <= i1; i++) {
    const s = samples[i], prev = samples[i - 1];
    if (prev && i > i0 && Math.abs(s.sunAz - prev.sunAz) > 180) segs.push([]);
    segs.at(-1)!.push(`${x(s.sunAz).toFixed(1)},${y(s.sunEl).toFixed(1)}`);
  }
  segs.at(-1)!.push(`${x(current.sunAz).toFixed(1)},${y(current.sunEl).toFixed(1)}`);
  const elTicks = [...new Set([yMin, 0, Math.round(yMax / 2), yMax])].filter((v) => v >= yMin && v <= yMax).sort((a, b) => a - b);

  return <div ref={ref}>
    <svg width={width} height={height} role="img" aria-label={`Horizon view. Sun at azimuth ${current.sunAz.toFixed(1)} degrees, elevation ${current.sunEl.toFixed(2)} degrees. Earth at azimuth ${current.earthAz.toFixed(1)} degrees, elevation ${current.earthEl.toFixed(2)} degrees.`} className="block">
      <rect x={PAD.left} y={y(0)} width={plotW} height={y(yMin) - y(0)} fill="#151327" />
      {elTicks.map((el) => <g key={el}>
        <line x1={PAD.left} x2={width - PAD.right} y1={y(el)} y2={y(el)} stroke={el === 0 ? INK_MUTED : GRID} strokeWidth={el === 0 ? 1.5 : 1} />
        <text x={PAD.left - 6} y={y(el) + 3} textAnchor="end" fill={INK_MUTED} fontSize="9" fontFamily="var(--font-mono, monospace)">{el}°</text>
      </g>)}
      <text x={width - PAD.right - 4} y={y(0) + 12} textAnchor="end" fill={INK_MUTED} fontSize="8" letterSpacing="1" fontFamily="var(--font-mono, monospace)">BELOW HORIZON</text>
      {["N", "E", "S", "W", "N"].map((c, i) => <text key={i} x={x(i * 90)} y={height - 6} textAnchor="middle" fill={INK_MUTED} fontSize="9" fontFamily="var(--font-mono, monospace)">{c}</text>)}
      {segs.filter((s) => s.length > 1).map((s, i) => <polyline key={i} points={s.join(" ")} fill="none" stroke={SUN} strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" />)}
      <g>
        <circle cx={x(current.earthAz)} cy={y(current.earthEl)} r="7" fill="#080712" stroke={EARTH} strokeWidth="2" />
        <text x={x(current.earthAz)} y={y(current.earthEl) - 11} textAnchor="middle" fill="#f0ebf7" fontSize="9" fontFamily="var(--font-mono, monospace)">EARTH</text>
      </g>
      <g>
        <circle cx={x(current.sunAz)} cy={y(current.sunEl)} r="8" fill={SUN} stroke="#080712" strokeWidth="2" />
        <text x={x(current.sunAz)} y={y(current.sunEl) - 12} textAnchor="middle" fill="#f0ebf7" fontSize="9" fontFamily="var(--font-mono, monospace)">SUN</text>
      </g>
    </svg>
  </div>;
}
