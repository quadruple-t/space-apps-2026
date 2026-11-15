"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { LineChart, RadioTower, Sun } from "lucide-react";
import { useFreeplay } from "@/lib/freeplay-store";
import { explainSolarNow, SOLAR_ARRAY_RATED_KW, solarShortfall, type HardwareAnalysis, type SolarNow } from "@/lib/hardware-analysis";
import { summarizeSetup } from "@/lib/setup-performance";
import { EARTH_RADIUS_DEG } from "@/lib/terrain/dem";
import { fmtDuration } from "@/components/freeplay/window-list";

/** A comms mast right now: Earth's elevation and the terrain horizon toward it, in the mast's own frame. */
export type CommsNow = { outsideTerrain: boolean; earthElevationDeg: number | null; horizonDeg: number | null; visible: number };

const DAY_MS = 86_400_000;
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

/** Same density as the telemetry readouts: tiny label over a small data value. */
function Cell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "blue" }) {
  const color = tone === "red" ? "text-retro-red" : tone === "blue" ? "text-retro-blue" : "text-bone";
  return <div className="hud-readout !px-1.5 !py-1"><div className="text-[0.55rem] leading-tight text-muted-foreground">{label}</div><div className={`type-data mt-0.5 text-[0.72rem] leading-tight ${color}`}>{value}</div></div>;
}

/** The shared card used for both power and comms, so they read with the same layout and density. */
function Card({ tone, icon, title, badge, children }: { tone: "red" | "blue"; icon: ReactNode; title: string; badge?: string; children: ReactNode }) {
  const text = tone === "red" ? "text-retro-red" : "text-retro-blue";
  const border = tone === "red" ? "border-retro-red/30" : "border-retro-blue/30";
  return <section aria-label={title} className={`rounded-md border bg-void/40 p-1.5 ${border}`}>
    <div className="flex items-center justify-between gap-2">
      <div className={`flex items-center gap-1 type-data text-[0.55rem] uppercase tracking-[0.12em] ${text}`}>{icon}{title}</div>
      {badge && <span className={`type-data rounded border px-1 py-px text-[0.5rem] uppercase ${text} ${border}`}>{badge}</span>}
    </div>
    {children}
  </section>;
}

/** Total array output and combined Earth contact over the simulation's UTC day, with a "now" marker. */
function DayGraph({ analysis, dayStartMs, nowMs, ratedKw, showPower, showComms }: { analysis: HardwareAnalysis; dayStartMs: number; nowMs: number; ratedKw: number; showPower: boolean; showComms: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const summary = useMemo(() => summarizeSetup(analysis, dayStartMs + DAY_MS), [analysis, dayStartMs]);
  const W = 260, top = 2, powerH = showPower ? 34 : 0, gap = showPower && showComms ? 6 : 0, stripH = showComms ? 8 : 0;
  const H = top + powerH + gap + stripH + 12;
  const x = (ms: number) => ((ms - dayStartMs) / DAY_MS) * W;
  const n = analysis.xs.length;
  const scale = Math.max(ratedKw, summary.peakKw, 1e-6);
  const y = (kw: number) => top + powerH - (kw / scale) * powerH;
  const area = showPower && n ? `M0 ${top + powerH} ` + Array.from(analysis.xs, (t, i) => `L${x(Math.min(t, dayStartMs + DAY_MS)).toFixed(1)} ${y(summary.totalKw[i]).toFixed(1)}`).join(" ") + ` L${W} ${top + powerH} Z` : "";
  const stripY = top + powerH + gap;
  const contact = Array.from({ length: n }, (_, i) => analysis.comms.some((m) => m.on[i]));
  const nowX = nowMs >= dayStartMs && nowMs <= dayStartMs + DAY_MS ? x(nowMs) : null;
  const hi = hover === null ? null : Math.min(n - 1, Math.max(0, hover));
  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none" role="img"
      aria-label={`UTC day graph.${showPower ? ` Array output peaks at ${summary.peakKw.toFixed(1)} kW of ${ratedKw.toFixed(1)} kW rated.` : ""}${showComms ? ` Earth contact ${fmtDuration(summary.contactHours)} in ${summary.windows.length} windows.` : ""}`}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (n - 1))); }}
      onPointerLeave={() => setHover(null)}>
      {showPower && <>
        <line x1={0} x2={W} y1={y(ratedKw)} y2={y(ratedKw)} className="stroke-retro-red/50" strokeDasharray="3 3" strokeWidth={1} />
        <line x1={0} x2={W} y1={top + powerH} y2={top + powerH} className="stroke-line" strokeWidth={1} />
        <path d={area} className="fill-retro-red/25 stroke-retro-red" strokeWidth={1.5} strokeLinejoin="round" />
      </>}
      {showComms && <>
        <rect x={0} y={stripY} width={W} height={stripH} rx={2} className="fill-line/60" />
        {summary.windows.map((w) => <rect key={w.startMs} x={x(w.startMs)} y={stripY} width={Math.max(1, x(w.endMs) - x(w.startMs))} height={stripH} rx={2} className="fill-retro-blue" />)}
      </>}
      {[0, 6, 12, 18, 24].map((h) => <text key={h} x={Math.min(W - 6, Math.max(6, (h / 24) * W))} y={H - 2} textAnchor="middle" className="fill-muted-foreground type-data" fontSize={7}>{String(h).padStart(2, "0")}</text>)}
      {nowX !== null && <line x1={nowX} x2={nowX} y1={0} y2={H - 10} className="stroke-bone" strokeWidth={1} />}
      {hi !== null && <line x1={x(analysis.xs[hi])} x2={x(analysis.xs[hi])} y1={0} y2={H - 10} className="stroke-retro-purple" strokeWidth={1} strokeDasharray="2 2" />}
    </svg>
    <p className="type-data mt-0.5 min-h-[1em] text-[0.52rem] text-muted-foreground">
      {hi !== null ? <>{hhmm(analysis.xs[hi])} UTC{showPower && <> · <span className="text-bone">{summary.totalKw[hi].toFixed(1)} kW</span></>}{showComms && <> · <span className="text-bone">{contact[hi] ? "Earth contact" : "no contact"}</span></>}</>
        : <>{showPower && <><span className="text-retro-red">■</span> array output (dashed = rated){showComms ? " · " : ""}</>}{showComms && <><span className="text-retro-blue">■</span> Earth contact</>} · white line = now</>}
    </p>
  </div>;
}

/**
 * Power and communications for the hardware placed in the surface drive: today's totals, why arrays
 * fall short of rated output, Earth contact, and a small day graph. Only loaded terrain blocks the view.
 */
export function HardwareTelemetry({ analysis, solarNow, commsNow, powerNowKw, nowMs, dayStartMs, radiusKm, graphsAvailable }: {
  analysis: HardwareAnalysis | null; solarNow: SolarNow[]; commsNow: CommsNow[]; powerNowKw: number | null;
  nowMs: number; dayStartMs: number; radiusKm: number | null; graphsAvailable: boolean;
}) {
  const solarCount = solarNow.length, mastCount = commsNow.length;
  const summary = useMemo(() => analysis ? summarizeSetup(analysis, dayStartMs + DAY_MS) : null, [analysis, dayStartMs]);
  const shortfall = useMemo(() => analysis?.solar.length ? solarShortfall(analysis.solar) : null, [analysis]);
  const reasons = useMemo(() => explainSolarNow(solarNow), [solarNow]);
  if (!solarCount && !mastCount) return null;
  const insideArrays = analysis?.solar.length ?? 0;
  const ratedKw = SOLAR_ARRAY_RATED_KW * insideArrays;

  const commsInside = commsNow.filter((m) => !m.outsideTerrain);
  const contactNow = commsInside.some((m) => m.visible > 0);
  const active = summary?.windows.find((w) => w.startMs <= nowMs && nowMs < w.endMs);
  const next = summary?.windows.find((w) => w.startMs > nowMs);
  const earthBelow = commsInside.length > 0 && commsInside.every((m) => m.earthElevationDeg !== null && m.earthElevationDeg <= -EARTH_RADIUS_DEG);
  const commsLine = !commsInside.length ? "Outside the loaded terrain: no Earth result. Increase the radius."
    : contactNow ? `Earth in view${active ? ` · window ends in ${fmtDuration((active.endMs - nowMs) / 3_600_000)}` : ""}`
    : `${earthBelow ? "Earth below the horizon" : "Earth blocked by terrain"}${next ? ` · next contact in ${fmtDuration((next.startMs - nowMs) / 3_600_000)}` : " · no more contact this UTC day"}`;

  return <section aria-label="Placed hardware: power and communications" className="space-y-1.5">
    {solarCount > 0 && <Card tone="red" icon={<Sun size={11} />} title={`Power · ${solarCount} arra${solarCount === 1 ? "y" : "ys"}`} badge={shortfall ? `${Math.round(shortfall.sharePercent)}% of rated` : undefined}>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <Cell label="Today" value={shortfall ? `${shortfall.generatedKWh.toFixed(0)} kWh` : "—"} tone="red" />
        <Cell label="Now" value={powerNowKw === null ? "—" : `${powerNowKw.toFixed(1)} kW`} tone="red" />
        <Cell label="Full potential" value={shortfall ? `${shortfall.potentialKWh.toFixed(0)} kWh` : "—"} />
      </div>
      {shortfall && <p className="mt-1 type-data text-[0.52rem] leading-snug text-muted-foreground">
        Gap <span className="text-bone">{shortfall.gapKWh.toFixed(0)} kWh</span>: night {fmtDuration(shortfall.nightHours)} (<span className="text-bone">{shortfall.nightKWh.toFixed(0)} kWh</span>) · terrain shadow {fmtDuration(shortfall.terrainHours)} (<span className="text-bone">{shortfall.terrainKWh.toFixed(0)} kWh</span>){insideArrays > 1 ? " · hours per array" : ""}
      </p>}
      <ul className="mt-0.5 space-y-px text-[0.52rem] leading-snug text-muted-foreground" aria-label="Why the arrays are below rated output now">
        {reasons.slice(0, 3).map((r) => <li key={r.kind}><span className={r.kind === "outside" ? "text-retro-red" : "text-bone"}>{solarCount > 1 ? `${r.count}× ` : "Now: "}</span>{r.text}</li>)}
      </ul>
    </Card>}

    {mastCount > 0 && <Card tone="blue" icon={<RadioTower size={11} />} title={`Comms · ${mastCount} mast${mastCount === 1 ? "" : "s"}`} badge={commsInside.length ? (contactNow ? "Contact now" : "No contact") : undefined}>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <Cell label="Earth now" value={commsInside.length ? (contactNow ? "In view" : "Hidden") : "—"} tone="blue" />
        <Cell label="Contact today" value={summary && analysis?.comms.length ? fmtDuration(summary.contactHours) : "—"} tone="blue" />
        <Cell label="Longest gap" value={summary && analysis?.comms.length ? fmtDuration(summary.longestGapHours) : "—"} />
      </div>
      <p className="mt-1 text-[0.52rem] leading-snug text-muted-foreground">{commsLine}</p>
    </Card>}

    {analysis && (analysis.solar.length > 0 || analysis.comms.length > 0) && <details className="group rounded-md border border-line/70 bg-void/40 px-1.5 py-1">
      <summary className="flex cursor-pointer list-none items-center gap-1 type-data text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-bone">
        <LineChart size={11} className="text-retro-purple" /><span className="flex-1">Today&apos;s {analysis.solar.length ? "sunlight" : ""}{analysis.solar.length && analysis.comms.length ? " & " : ""}{analysis.comms.length ? "Earth contact" : ""} · UTC</span><span aria-hidden className="transition group-open:rotate-90">›</span>
      </summary>
      <div className="mt-1">
        <DayGraph analysis={analysis} dayStartMs={dayStartMs} nowMs={nowMs} ratedKw={ratedKw} showPower={analysis.solar.length > 0} showComms={analysis.comms.length > 0} />
        {graphsAvailable && <Link href="/open-exploration" onClick={() => useFreeplay.getState().setView("orbit")} className="mt-1 inline-flex items-center gap-1 type-data text-[0.52rem] uppercase tracking-[0.1em] text-retro-blue hover:underline"><LineChart size={10} />Full site graphs in Open Exploration</Link>}
      </div>
    </details>}

    <p className="text-[0.5rem] leading-snug text-muted-foreground">
      {!analysis ? "Waiting for terrain and ephemeris for today's totals. " : ""}UTC day, 15-min steps. Only the loaded {radiusKm ? `${radiusKm} km ` : ""}terrain blocks: upper bounds near its edge. Rated {SOLAR_ARRAY_RATED_KW.toFixed(1)} kW/array (18 m², 30%, tracking) × 24 h.
    </p>
  </section>;
}
