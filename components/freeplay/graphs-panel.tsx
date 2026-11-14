"use client";

import { useMemo } from "react";
import { Download, Settings2 } from "lucide-react";
import { Popover } from "radix-ui";
import { SOLAR_CONSTANT_W_M2, type Sample } from "@/lib/illumination";
import { useFreeplay, type GraphTab } from "@/lib/freeplay-store";
import { EARTH, SUN, TimeSeriesChart } from "./charts";

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v * 1.05)!; };

/** P = area × efficiency × 1361 W/m² × sin(Sun elevation), horizontal panel. */
export function solarPowerW(sunElDeg: number, areaM2: number, efficiency: number) {
  return sunElDeg > 0 ? areaM2 * efficiency * SOLAR_CONSTANT_W_M2 * Math.sin((sunElDeg * Math.PI) / 180) : 0;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function GraphTabs({ vertical = false }: { vertical?: boolean }) {
  const tab = useFreeplay((s) => s.graphTab);
  const setTab = useFreeplay((s) => s.setGraphTab);
  const tabs: { id: GraphTab; label: string; hint: string }[] = [
    { id: "daily", label: "Daily", hint: "Hourly over the mission" },
    { id: "yearly", label: "Yearly", hint: "One point per lunar day" },
  ];
  return <div role="tablist" aria-label="Graph range" className={vertical ? "flex flex-col gap-1" : "flex overflow-hidden rounded border border-line"}>
    {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
      className={vertical
        ? `rounded border px-2.5 py-2 text-left ${tab === t.id ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:text-bone"}`
        : `type-data px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.1em] ${tab === t.id ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>
      <span className={vertical ? "block text-[0.7rem]" : ""}>{t.label}</span>
      {vertical && <span className="block text-[0.54rem] text-muted-foreground">{t.hint}</span>}
    </button>)}
  </div>;
}

export function PanelSettings() {
  const area = useFreeplay((s) => s.panelAreaM2);
  const eff = useFreeplay((s) => s.panelEfficiency);
  const setPanel = useFreeplay((s) => s.setPanel);
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className="flex items-center gap-1 rounded border border-line px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone" aria-label="Solar panel settings">
        <Settings2 size={13} />Panel {area} m² · {Math.round(eff * 100)}%
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content sideOffset={6} align="end" className="hud-panel z-50 w-60 p-3 text-[0.62rem] text-muted-foreground">
        <div className="type-data text-[0.56rem] uppercase tracking-[0.14em] text-retro-purple">Solar power estimate</div>
        <p className="mt-1 leading-snug">P = area × efficiency × 1361 W/m² × sin(Sun elevation), flat panel, Sun above the horizon.</p>
        <label className="mt-2 block">Panel area (m²)
          <input type="number" min={0.1} max={1000} step={0.1} defaultValue={area} className="hud-input mt-1"
            onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPanel(v, eff); }} />
        </label>
        <label className="mt-2 block">Efficiency (%)
          <input type="number" min={1} max={100} step={1} defaultValue={Math.round(eff * 100)} className="hud-input mt-1"
            onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 100) setPanel(area, v / 100); }} />
        </label>
        <Popover.Arrow className="fill-line" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export function DailyGraphs({ samples, siteId, startMs, tMs }: { samples: Sample[]; siteId: string; startMs: number; tMs: number }) {
  const area = useFreeplay((s) => s.panelAreaM2);
  const eff = useFreeplay((s) => s.panelEfficiency);
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const d = useMemo(() => {
    const n = samples.length;
    const xs = new Float64Array(n), sun = new Float64Array(n), earth = new Float64Array(n), power = new Float64Array(n);
    const lit: boolean[] = [], seen: boolean[] = [];
    let energyWh = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      xs[i] = s.t; sun[i] = s.sunEl; earth[i] = s.earthEl; power[i] = solarPowerW(s.sunEl, area, eff);
      lit.push(s.sunEl > 0); seen.push(s.earthEl > 0); energyWh += power[i];
    }
    return { xs, sun, earth, power, lit, seen, energyKWh: energyWh / 1000, litPct: (lit.filter(Boolean).length / n) * 100, seenPct: (seen.filter(Boolean).length / n) * 100 };
  }, [samples, area, eff]);
  const seek = (x: number) => setElapsed((x - startMs) / 3_600_000);
  const fmtTick = samples.length > 72 ? fmtDay : (ms: number) => new Date(ms).toISOString().slice(11, 16);

  const exportCsv = () => downloadCsv(`${siteId}_${new Date(startMs).toISOString().slice(0, 10)}_daily.csv`,
    ["time_utc", "sun_azimuth_deg", "sun_elevation_deg", "earth_azimuth_deg", "earth_elevation_deg", "solar_power_w"],
    samples.map((s, i) => [new Date(s.t).toISOString(), s.sunAz, s.sunEl, s.earthAz, s.earthEl, d.power[i].toFixed(2)]));

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-data text-[0.58rem] text-muted-foreground">
        Sun up {d.litPct.toFixed(0)}% · Earth visible {d.seenPct.toFixed(0)}% · {d.energyKWh.toFixed(1)} kWh over the mission
      </p>
      <button type="button" onClick={exportCsv} className="flex items-center gap-1 rounded border border-line px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone"><Download size={13} />CSV</button>
    </div>
    <div>
      <h3 className="type-heading text-xs text-bone">Sun and Earth elevation at the site</h3>
      <TimeSeriesChart title="Sun and Earth elevation" xs={d.xs} yUnit="°" zeroLine cursorX={tMs} onSeek={seek} formatX={fmtTime} formatTick={fmtTick}
        series={[
          { id: "sun", label: "Sun elevation", color: SUN, values: d.sun, unit: "°", digits: 2 },
          { id: "earth", label: "Earth elevation", color: EARTH, values: d.earth, unit: "°", digits: 2 },
        ]}
        bands={[{ label: "DAY", color: SUN, on: d.lit }, { label: "EARTH", color: EARTH, on: d.seen }]} />
    </div>
    <div>
      <h3 className="type-heading text-xs text-bone">Estimated solar power (W), flat {area} m² panel at {Math.round(eff * 100)}%</h3>
      <TimeSeriesChart title="Estimated solar power" xs={d.xs} yUnit="W" cursorX={tMs} onSeek={seek} formatX={fmtTime} formatTick={fmtTick} height={150}
        yDomain={[0, niceCeil(Math.max(1, ...d.power))]}
        series={[{ id: "power", label: "Power", color: SUN, values: d.power, unit: " W", digits: 1, area: true }]} />
    </div>
  </div>;
}
