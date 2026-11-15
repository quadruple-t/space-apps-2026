"use client";

import { useMemo } from "react";
import type { HardwareAnalysis } from "@/lib/hardware-analysis";
import { summarizeSetup } from "@/lib/setup-performance";
import { fmtDuration, WindowList } from "@/components/freeplay/window-list";

export function SetupPerformance({ analysis, powerNowKw, nowMs, startMs, habitatCount, mastCount, solarCount, loadKw, onLoad }: {
  analysis: HardwareAnalysis | null; powerNowKw: number | null; nowMs: number; startMs: number;
  habitatCount: number; mastCount: number; solarCount: number; loadKw: number; onLoad: (kw: number) => void;
}) {
  const endMs = startMs + 86_400_000;
  const summary = useMemo(() => analysis ? summarizeSetup(analysis, endMs) : null, [analysis, endMs]);
  const demand = habitatCount * loadKw;
  const active = summary?.windows.find((w) => w.startMs <= nowMs && nowMs < w.endMs);
  const next = summary?.windows.find((w) => w.startMs > nowMs);
  return <section aria-label="Habitat power and communications" className="space-y-3 border-t border-line/80 pt-3 text-[.62rem] text-muted-foreground">
    <h3 className="type-data uppercase tracking-[.12em] text-retro-purple">Setup performance · UTC day</h3>
    <div className="grid grid-cols-2 gap-2">
      <div className="hud-readout">Solar power now<p className="type-data mt-1 text-base text-bone">{powerNowKw === null ? "Loading…" : `${powerNowKw.toFixed(2)} kW`}</p></div>
      <div className="hud-readout">Solar energy today<p className="type-data mt-1 text-base text-bone">{summary ? `${summary.energyKWh.toFixed(1)} kWh` : "Loading…"}</p></div>
    </div>
    <p>{solarCount} solar arrays feed a shared power bus. Estimated generation includes terrain shadow and Sun distance.</p>
    {habitatCount > 0 ? <>
      <label className="block">Assumed continuous load per habitat (kW)
        <input type="number" min={0} max={1000} step={0.5} value={loadKw} onChange={(e) => { const kw = e.currentTarget.valueAsNumber; if (Number.isFinite(kw) && kw >= 0 && kw <= 1000) onLoad(kw); }} className="hud-input mt-1" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div>Habitat demand<p className="type-data text-bone">{demand.toFixed(1)} kW · {(demand * 24).toFixed(0)} kWh/day</p></div>
        <div>Solar surplus / deficit now<p className={`type-data ${powerNowKw !== null && powerNowKw < demand ? "text-retro-red" : "text-bone"}`}>{powerNowKw === null ? "Loading…" : `${powerNowKw - demand >= 0 ? "+" : ""}${(powerNowKw - demand).toFixed(2)} kW`}</p></div>
      </div>
      {summary && <p>Day-average generation {(summary.energyKWh / 24).toFixed(2)} kW · sampled peak {summary.peakKw.toFixed(2)} kW · daily energy balance {(summary.energyKWh - demand * 24).toFixed(1)} kWh.</p>}
      <p className="text-[.54rem]">The default 5 kW is an editable planning assumption, not a habitat specification. Batteries, wiring losses, buggy charging and mast loads are not modeled; a positive daily balance does not guarantee continuous power.</p>
    </> : <p>Place a habitat to compare solar generation with an editable habitat power demand.</p>}
    {!mastCount ? <p>Place a comms mast to see communication windows and terrain-clear coverage.</p> : !summary || !analysis ? <p>Waiting for terrain and ephemeris coverage to calculate mast windows.</p> : <>
      <h4 className="text-bone">Earth communications · {analysis.comms.length} mast{analysis.comms.length === 1 ? "" : "s"}</h4>
      <div className="grid grid-cols-2 gap-2">
        <div>Contact available<p className="type-data text-bone">{fmtDuration(summary.contactHours)} · {(summary.contactHours / 24 * 100).toFixed(1)}% today</p></div>
        <div>Full Earth disc clear<p className="type-data text-bone">{(summary.clearHours / 24 * 100).toFixed(1)}% today</p></div>
        <div>Longest window<p className="type-data text-bone">{fmtDuration(summary.longestWindowHours)}</p></div>
        <div>Longest blackout<p className="type-data text-bone">{fmtDuration(summary.longestGapHours)}</p></div>
      </div>
      <p className="text-bone">{active ? `Contact now · about ${fmtDuration((active.endMs - nowMs) / 3_600_000)} left in this window` : next ? `Next window in about ${fmtDuration((next.startMs - nowMs) / 3_600_000)}` : "No further window in this UTC day"}</p>
      <details><summary className="cursor-pointer">{summary.windows.length} combined contact windows · UTC</summary><div className="mt-2"><WindowList windows={summary.windows} max={summary.windows.length} emptyText="No Earth contact today." /></div></details>
      {analysis.comms.map((mast) => <p key={mast.id}>{mast.label}: {fmtDuration(mast.visibleHours)} contact · longest {fmtDuration(mast.longestWindowHours)} · longest gap {fmtDuration(mast.longestGapHours)}.</p>)}
      <p className="text-[.54rem]">15-minute estimates, clipped to this UTC day. A window may continue beyond midnight. Coverage counts any mast seeing Earth, without double-counting overlaps. Full-disc clearance is a terrain-visibility margin, not radio reliability: link budget, interference, equipment failures and local relay links are not modeled.</p>
    </>}
    <p className="text-[.54rem]">Only loaded terrain can block the view; results near its edge are upper bounds.</p>
  </section>;
}
