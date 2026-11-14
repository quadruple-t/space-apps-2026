"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useSize } from "./use-size";

export const SUN = "#ff5364";
export const EARTH = "#4b9bff";
const GRID = "#302c4a";
const MUTED = "#b2abc4";
const INK = "#f0ebf7";
const MONO = "var(--font-plex-mono), monospace";

export type Series = { id: string; label: string; color: string; values: ArrayLike<number>; unit: string; digits?: number; area?: boolean };
export type Band = { label: string; color: string; on: ArrayLike<boolean> };

type Props = {
  title: string;
  /** x position of each sample, epoch ms (or any monotonic number) */
  xs: ArrayLike<number>;
  series: Series[];
  bands?: Band[];
  yDomain?: [number, number];
  yUnit: string;
  zeroLine?: boolean;
  markers?: boolean;
  cursorX?: number;
  onSeek?: (x: number) => void;
  formatX: (x: number) => string;
  formatTick?: (x: number) => string;
  height?: number;
};

const PAD = { top: 8, right: 54, bottom: 22, left: 42 };
const LANE = 9;

function niceStep(span: number) {
  const raw = span / 4, p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw)!;
}

/** Line chart on one y axis, optional on/off band lanes above the plot, crosshair tooltip, click to seek. */
export function TimeSeriesChart({ title, xs, series, bands = [], yDomain, yUnit, zeroLine, markers, cursorX, onSeek, formatX, formatTick = formatX, height = 190 }: Props) {
  const [ref, { width }] = useSize<HTMLDivElement>({ width: 420, height });
  const [hover, setHover] = useState<number | null>(null);
  const n = xs.length;
  const d0 = yDomain?.[0], d1 = yDomain?.[1];

  // Everything that depends only on data and size. Playback re-renders every
  // frame but only moves the cursor, so this must not rerun then.
  const geom = useMemo(() => {
    if (n < 2) return null;
    const lanesH = bands.length ? bands.length * (LANE + 3) + 4 : 0;
    const top = PAD.top + lanesH;
    const plotW = Math.max(40, width - PAD.left - PAD.right), plotH = height - top - PAD.bottom;
    const x0 = xs[0], x1 = xs[n - 1];
    const X = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * plotW;

    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (let i = 0; i < n; i++) { lo = Math.min(lo, s.values[i]); hi = Math.max(hi, s.values[i]); }
    if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const fixed = d0 !== undefined && d1 !== undefined;
    let yMin = fixed ? d0 : lo, yMax = fixed ? d1 : hi;
    if (!fixed) { const pad = (yMax - yMin || 1) * 0.08; yMin -= pad; yMax += pad; }
    const step = niceStep(yMax - yMin);
    if (!fixed) { yMin = Math.floor(yMin / step) * step; yMax = Math.ceil(yMax / step) * step; }
    const Y = (v: number) => top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + step * 1e-6; v += step) ticks.push(Number(v.toFixed(6)));

    // Dense series: a min/max envelope per pixel column keeps a year of hourly data honest.
    const cols = Math.round(plotW);
    const pathFor = (vals: ArrayLike<number>) => {
      let d = "";
      if (n <= cols * 2) {
        for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(vals[i]).toFixed(1)}`;
        return d;
      }
      const mn = new Float64Array(cols + 1).fill(Infinity), mx = new Float64Array(cols + 1).fill(-Infinity);
      for (let i = 0; i < n; i++) { const c = Math.round(X(xs[i]) - PAD.left); mn[c] = Math.min(mn[c], vals[i]); mx[c] = Math.max(mx[c], vals[i]); }
      for (let c = 0; c <= cols; c++) if (mn[c] !== Infinity) d += `${d ? "L" : "M"}${(PAD.left + c).toFixed(1)},${Y(mx[c]).toFixed(1)}L${(PAD.left + c).toFixed(1)},${Y(mn[c]).toFixed(1)}`;
      return d;
    };
    const paths = series.map((s) => pathFor(s.values));
    const runs = bands.map((b) => {
      const out: { a: number; b: number }[] = [];
      let startI = -1;
      for (let i = 0; i <= n; i++) {
        const on = i < n && b.on[i];
        if (on && startI < 0) startI = i;
        if (!on && startI >= 0) { out.push({ a: startI, b: i - 1 }); startI = -1; }
      }
      return out;
    });
    return { top, plotW, plotH, x0, x1, X, Y, yMin, ticks, paths, runs };
  }, [xs, series, bands, width, height, d0, d1, zeroLine, n]);

  if (!geom) return <div ref={ref} />;
  const { top, plotW, plotH, x0, x1, X, Y, yMin, ticks, paths, runs } = geom;

  const indexAt = (e: MouseEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    if (px < PAD.left - 4 || px > PAD.left + plotW + 4) return null;
    const x = x0 + ((px - PAD.left) / plotW) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i; else if (xs[i] > x) break;
    return best;
  };

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + (x1 - x0) * f);
  const legend = series.length > 1;

  return <div ref={ref} className="relative">
    {legend && <div className="mb-1 flex flex-wrap gap-3 type-data text-[0.58rem] text-muted-foreground" aria-hidden>
      {series.map((s) => <span key={s.id} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color }} />{s.label}</span>)}
    </div>}
    <svg width={width} height={height} role="img" aria-label={`${title}. ${series.map((s) => s.label).join(", ")} over time.`}
      className={`block touch-none ${onSeek ? "cursor-crosshair" : ""}`}
      onMouseMove={(e) => setHover(indexAt(e))} onMouseLeave={() => setHover(null)}
      onClick={(e) => { const i = indexAt(e); if (i !== null && onSeek) onSeek(xs[i]); }}>
      {bands.map((b, k) => {
        const y = PAD.top + k * (LANE + 3);
        return <g key={b.label}>
          <rect x={PAD.left} y={y} width={plotW} height={LANE} fill={GRID} fillOpacity="0.45" rx="2" />
          {runs[k].map((r, j) => <rect key={j} x={X(xs[r.a])} y={y} width={Math.max(1, X(xs[r.b]) - X(xs[r.a]))} height={LANE} fill={b.color} fillOpacity="0.85" rx="2" />)}
          <text x={PAD.left + plotW + 4} y={y + LANE - 1} fill={MUTED} fontSize="8" fontFamily={MONO}>{b.label}</text>
        </g>;
      })}

      {ticks.map((v) => <g key={v}>
        <line x1={PAD.left} x2={PAD.left + plotW} y1={Y(v)} y2={Y(v)} stroke={zeroLine && v === 0 ? MUTED : GRID} strokeWidth={zeroLine && v === 0 ? 1.25 : 1} />
        <text x={PAD.left - 5} y={Y(v) + 3} textAnchor="end" fill={MUTED} fontSize="9" fontFamily={MONO}>{Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number(v.toFixed(2))}{yUnit === "°" ? "°" : ""}</text>
      </g>)}
      {zeroLine && <text x={PAD.left + 3} y={Y(0) - 3} fill={MUTED} fontSize="8" fontFamily={MONO}>HORIZON</text>}

      {series.map((s, k) => {
        const d = paths[k];
        return <g key={s.id}>
          {s.area && <path d={`${d}L${X(x1)},${Y(Math.max(yMin, 0))}L${X(x0)},${Y(Math.max(yMin, 0))}Z`} fill={s.color} fillOpacity="0.14" />}
          <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          {markers && Array.from({ length: n }, (_, i) => <circle key={i} cx={X(xs[i])} cy={Y(s.values[i])} r="4" fill={s.color} stroke="#0d0b1a" strokeWidth="2" />)}
          {legend && <text x={PAD.left + plotW + 4} y={Y(s.values[n - 1]) + 3} fill={INK} fontSize="9" fontFamily={MONO}>{s.label.split(" ")[0]}</text>}
        </g>;
      })}

      {cursorX !== undefined && cursorX >= x0 && cursorX <= x1 && <line x1={X(cursorX)} x2={X(cursorX)} y1={PAD.top} y2={top + plotH} stroke={INK} strokeWidth="1.5" />}
      {hover !== null && <>
        <line x1={X(xs[hover])} x2={X(xs[hover])} y1={top} y2={top + plotH} stroke={MUTED} strokeDasharray="2 3" />
        {series.map((s) => <circle key={s.id} cx={X(xs[hover])} cy={Y(s.values[hover])} r="4" fill={s.color} stroke="#0d0b1a" strokeWidth="2" />)}
      </>}

      <g fill={MUTED} fontSize="9" fontFamily={MONO}>
        {xTicks.map((x, i) => <text key={i} x={X(x)} y={height - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{formatTick(x)}</text>)}
      </g>
    </svg>
    {hover !== null && <div className="pointer-events-none absolute top-6 z-10 w-[184px] rounded border border-line bg-popover/95 px-2.5 py-2 text-[0.62rem] leading-relaxed text-bone shadow-lg"
      style={{ left: Math.min(Math.max(X(xs[hover]) + 12, 0), width - 192) }}>
      <div className="type-data text-muted-foreground">{formatX(xs[hover])}</div>
      {series.map((s) => <div key={s.id} className="flex justify-between gap-2"><span><span style={{ color: s.color }}>●</span> {s.label}</span><span className="tabular-nums">{s.values[hover].toFixed(s.digits ?? 1)}{s.unit}</span></div>)}
      {bands.map((b) => <div key={b.label} className="text-muted-foreground">{b.label}: {b.on[hover] ? "yes" : "no"}</div>)}
      {onSeek && <div className="mt-1 text-muted-foreground">Click to jump here</div>}
    </div>}
  </div>;
}
