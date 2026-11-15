"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Download, Hammer } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { useDemTile } from "@/app/freeplay/drive/use-dem-tile";
import { driveHref } from "@/lib/drive-link";
import { loadPlacements, placementSiteKey, SOLAR_ARRAY_AREA_M2, SOLAR_ARRAY_EFFICIENCY } from "@/lib/drive-placements";
import { useFreeplay } from "@/lib/freeplay-store";
import { windowHours } from "@/lib/visibility-windows";
import { analyseHardware } from "@/lib/hardware-analysis";
import type { Sample } from "@/lib/illumination";
import { downloadCsv } from "./graphs-panel";
import { EARTH, TimeSeriesChart, type Band, type Series } from "./charts";
import { fmtDuration, WindowList } from "./window-list";

const ARRAY_COLORS = ["#ff5364", "#ff9955", "#ffcf66", "#f48fb1"];
const MAST_COLORS = ["#4b9bff", "#70d7ff", "#a986ff"];
const MAX_MASTS_CHARTED = 3;

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const fmtHour = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(v || 1)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v * 1.05)!; };
const distance = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

/**
 * Generation and communication windows for the solar arrays and comms masts placed in the surface drive
 * at this site, from the same Sun/Earth samples as the graphs above and the terrain around each object.
 */
export function HardwareGraphs({ site, samples, startMs, tMs, endMs = samples.at(-1)?.t ?? startMs }: { site: FreeplaySite; samples: Sample[]; startMs: number; tMs: number; endMs?: number }) {
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const siteKey = placementSiteKey(site.latitudeDeg, site.longitudeDeg);
  const placements = useMemo(() => loadPlacements(siteKey).filter((p) => p.type === "solar" || p.type === "comms"), [siteKey]);
  const farKm = placements.reduce((m, p) => Math.max(m, Math.hypot(p.eastM, p.northM)), 0) / 1000;
  // Large enough to hold every placement, whatever radius the drive was last used at.
  const radiusKm = Math.min(500, Math.max(site.radiusKm, Number((farKm * 1.15 + 0.2).toPrecision(3))));
  const has = placements.length > 0;
  const dem = useDemTile(has ? site.latitudeDeg : null, has ? site.longitudeDeg : null, radiusKm, 129);
  const tile = dem.tile;

  const analysis = useMemo(() => tile && samples.length > 1 ? analyseHardware(tile, tile.center.latDeg, samples, placements, endMs) : null, [tile, samples, placements, endMs]);

  const charts = useMemo(() => {
    if (!analysis) return null;
    const { solar, comms, xs } = analysis;
    const total = new Float64Array(xs.length);
    for (const a of solar) for (let i = 0; i < total.length; i++) total[i] += a.kw[i];
    let peak = 0;
    for (let i = 0; i < total.length; i++) peak = Math.max(peak, total[i]);
    const solarSeries: Series[] = [
      ...solar.map((a, k) => ({ id: a.id, label: a.label, color: ARRAY_COLORS[k % ARRAY_COLORS.length], values: a.kw, unit: " kW", digits: 1 })),
      ...(solar.length > 1 ? [{ id: "total", label: "Total", color: "#ffd8a6", values: total, unit: " kW", digits: 1, area: true }] : []),
    ];
    const masts = comms.slice(0, MAX_MASTS_CHARTED);
    const commSeries: Series[] = [
      ...masts.map((m, k) => ({ id: m.id, label: `${m.label} · Earth`, color: MAST_COLORS[k % MAST_COLORS.length], values: m.earthEl, unit: "°", digits: 1 })),
      ...(masts[0] ? [{ id: `${masts[0].id}-terrain`, label: "Terrain toward Earth", color: "#8a84a3", values: masts[0].horizon, unit: "°", digits: 1 }] : []),
    ];
    const bands: Band[] = masts.map((m, k) => ({ label: `COMMS ${k + 1}`, color: EARTH, on: m.on }));
    return { total, solarSeries, commSeries, bands, solarDomain: [0, niceCeil(peak)] as [number, number], totalKWh: solar.reduce((s, a) => s + a.energyKWh, 0), peakKw: peak };
  }, [analysis]);

  const seek = (x: number) => setElapsed((x - startMs) / 3_600_000);
  const fmtTick = samples.length > 72 ? fmtDay : fmtHour;

  const exportCsv = () => {
    if (!analysis) return;
    const { solar, comms, xs } = analysis;
    downloadCsv(`${site.id}_hardware.csv`,
      ["time_utc", ...solar.map((a) => `${a.label.replace(/ /g, "_")}_kw`), ...comms.map((m) => `${m.label.replace(/ /g, "_")}_earth_visible`)],
      Array.from(xs, (x, i) => [new Date(x).toISOString(), ...solar.map((a) => a.kw[i].toFixed(3)), ...comms.map((m) => (m.on[i] ? 1 : 0))]));
  };

  return <section aria-label="Placed hardware" className="flex flex-col gap-3 border-t border-line/80 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Placed hardware</h3>
        <p className="mt-0.5 text-[0.56rem] text-muted-foreground">Solar generation and Earth communication windows for what you placed in the surface drive at this site.</p>
      </div>
      {analysis && <button type="button" onClick={exportCsv} className="flex items-center gap-1 rounded border border-line px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone"><Download size={13} />CSV</button>}
    </div>

    {!has && <div className="rounded border border-line/80 p-3 text-[0.62rem] leading-relaxed text-muted-foreground">
      <p>Nothing placed at {site.name} yet. Open the surface drive, choose <span className="text-bone">Terrain &amp; build</span>, and place solar arrays and comms masts. Their generation and communication windows will appear here.</p>
      <Link href={driveHref(site, tMs)} className="mt-2 inline-flex items-center gap-1.5 rounded border border-retro-purple/50 bg-retro-purple/10 px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.1em] text-retro-purple hover:bg-retro-purple/20"><Hammer size={12} />Open surface drive</Link>
    </div>}
    {has && dem.loading && <p className="type-data animate-pulse text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Loading terrain around your hardware…</p>}
    {has && dem.error && <p role="alert" className="text-xs text-destructive">Couldn&apos;t load terrain for line of sight: {dem.error}</p>}

    {analysis && charts && <>
      {analysis.solar.length > 0 && <div className="flex flex-col gap-2">
        <h4 className="type-heading text-xs text-bone">Solar generation <span className="type-data font-normal text-muted-foreground">({analysis.solar.length} array{analysis.solar.length === 1 ? "" : "s"} · {charts.totalKWh.toFixed(0)} kWh over the period · peak {charts.peakKw.toFixed(1)} kW)</span></h4>
        <TimeSeriesChart title="Solar generation of placed arrays" xs={analysis.xs} yUnit="kW" cursorX={tMs} onSeek={seek} formatX={fmtTime} formatTick={fmtTick} height={160}
          yDomain={charts.solarDomain} series={charts.solarSeries} />
        <table className="type-data w-full text-left text-[0.56rem] text-muted-foreground">
          <thead className="text-[0.5rem] uppercase tracking-[0.08em]"><tr><th className="py-1 font-normal">Array</th><th className="font-normal">From centre</th><th className="font-normal">Daylight</th><th className="font-normal">Peak</th><th className="text-right font-normal">Energy</th></tr></thead>
          <tbody>{analysis.solar.map((a, k) => <tr key={a.id} className="border-t border-line/60">
            <td className="py-1 text-bone"><span style={{ color: ARRAY_COLORS[k % ARRAY_COLORS.length] }}>●</span> {a.label}</td>
            <td>{distance(Math.hypot(a.eastM, a.northM))}</td><td>{fmtDuration(windowHours(a.windows))}</td><td>{a.peakKw.toFixed(1)} kW</td><td className="text-right text-bone">{a.energyKWh.toFixed(0)} kWh</td>
          </tr>)}</tbody>
        </table>
        {analysis.solar.map((array) => <div key={array.id} className="text-[0.58rem] text-muted-foreground">
          <p className="text-bone">{array.label} · longest daylight {fmtDuration(array.longestDayHours)} · longest night {fmtDuration(array.longestNightHours)}</p>
          <WindowList windows={array.windows} emptyText="No daylight in this period." accent="text-retro-red" />
        </div>)}
        <p className="text-[0.52rem] leading-relaxed text-muted-foreground">Daylight windows count any visible part of the Sun. Each array is {SOLAR_ARRAY_AREA_M2} m² at {Math.round(SOLAR_ARRAY_EFFICIENCY * 100)}% and tracks the Sun, so power is the solar constant (scaled by Sun distance) times area times efficiency, reduced by the share of the Sun&apos;s disc the terrain hides.</p>
      </div>}

      {analysis.comms.length > 0 && <div className="flex flex-col gap-2">
        <h4 className="type-heading text-xs text-bone">Communication windows <span className="type-data font-normal text-muted-foreground">(Earth above the terrain at each mast)</span></h4>
        <TimeSeriesChart title="Earth elevation and communication windows at placed comms masts" xs={analysis.xs} yUnit="°" zeroLine cursorX={tMs} onSeek={seek} formatX={fmtTime} formatTick={fmtTick} height={170}
          series={charts.commSeries} bands={charts.bands} />
        {analysis.comms.map((m, k) => <div key={m.id}>
          <p className="type-data text-[0.58rem] text-bone"><span style={{ color: MAST_COLORS[k % MAST_COLORS.length] }}>●</span> {m.label} · {distance(Math.hypot(m.eastM, m.northM))} from centre · {m.windows.length} window{m.windows.length === 1 ? "" : "s"} · {((m.visibleHours / (Math.max(1 / 3600, (endMs - startMs) / 3_600_000))) * 100).toFixed(0)}% of the period</p>
          <p className="mt-1 text-[0.58rem] text-muted-foreground">Total contact {fmtDuration(m.visibleHours)} · longest window {fmtDuration(m.longestWindowHours)} · longest blackout {fmtDuration(m.longestGapHours)}</p>
          <WindowList windows={m.windows} emptyText="No Earth contact in this period." />
        </div>)}
        {analysis.comms.length > MAX_MASTS_CHARTED && <p className="text-[0.52rem] text-muted-foreground">The chart shows the first {MAX_MASTS_CHARTED} masts; all are listed above.</p>}
      </div>}

      {analysis.comms.length === 0 && <p className="rounded border border-line/80 p-2 text-[0.58rem] text-muted-foreground">No comms mast placed, so there are no hardware communication windows. The site-wide Earth visibility is in the graph above.</p>}
      <p className="text-[0.52rem] leading-relaxed text-muted-foreground">Light and line of sight use the Sun and Earth samples above and only the terrain inside {tile?.radiusKm} km of the site (GLD100 heights, ~100 m posting), so they are upper bounds near that edge.</p>
    </>}
  </section>;
}
