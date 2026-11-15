"use client";

import { useMemo } from "react";
import { Download, Settings2 } from "lucide-react";
import { Popover } from "radix-ui";
import { earthUp, SOLAR_CONSTANT_W_M2, summarizeByLunarDay, sunUp, type Sample } from "@/lib/illumination";
import { useFreeplay, type GraphTab } from "@/lib/freeplay-store";
import { windowsFrom, windowHours, longestWindowHours } from "@/lib/visibility-windows";
import { fmtDuration, WindowList } from "./window-list";
import { EARTH, SUN, TimeSeriesChart } from "./charts";

export type GraphFocus = "sunlight" | "earth" | "power";

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v * 1.05)!; };

/** P = area × efficiency × 1361 W/m² × sin(Sun elevation), horizontal panel; zero when terrain blocks the Sun. */
export function solarPowerW(s: Sample, areaM2: number, efficiency: number) {
  return sunUp(s) ? areaM2 * efficiency * SOLAR_CONSTANT_W_M2 * Math.sin((s.sunEl * Math.PI) / 180) : 0;
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

export function DailyGraphs({ samples, siteId, startMs, tMs, endMs = samples.at(-1)?.t ?? startMs, focus }: { samples: Sample[]; siteId: string; startMs: number; tMs: number; endMs?: number; focus: GraphFocus }) {
  const area = useFreeplay((s) => s.panelAreaM2);
  const eff = useFreeplay((s) => s.panelEfficiency);
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const d = useMemo(() => {
    const n = samples.length;
    const xs = new Float64Array(n), sun = new Float64Array(n), earth = new Float64Array(n), power = new Float64Array(n), terrain = new Float64Array(n);
    const lit: boolean[] = [], seen: boolean[] = [];
    let energyWh = 0;
    const stepMs = samples.length > 1 ? samples[1].t - samples[0].t : 3_600_000;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      xs[i] = s.t; sun[i] = s.sunEl; earth[i] = s.earthEl; power[i] = solarPowerW(s, area, eff); terrain[i] = s.sunHorizon;
      lit.push(sunUp(s)); seen.push(earthUp(s)); energyWh += power[i] * Math.max(0, Math.min(endMs, s.t + stepMs) - s.t) / 3_600_000;
    }
    const hasTerrain = terrain.some((h) => Math.abs(h) > 0.005);
    let peak = 1;
    for (let i = 0; i < n; i++) peak = Math.max(peak, power[i]);
    return {
      xs, power, energyKWh: energyWh / 1000,
      daylight: windowsFrom(xs, lit, stepMs, endMs), contact: windowsFrom(xs, seen, stepMs, endMs),
      night: windowsFrom(xs, lit.map((value) => !value), stepMs, endMs), blackout: windowsFrom(xs, seen.map((value) => !value), stepMs, endMs),
      stepMs,
      litPct: (lit.filter(Boolean).length / n) * 100, seenPct: (seen.filter(Boolean).length / n) * 100,
      // Stable array identities so the charts' cached paths survive playback re-renders.
      sunSeries: { id: "sun", label: "Sun elevation", color: SUN, values: sun, unit: "°", digits: 2 },
      earthSeries: { id: "earth", label: "Earth elevation", color: EARTH, values: earth, unit: "°", digits: 2 },
      ...(hasTerrain ? { terrainSeries: { id: "terrain", label: "Terrain under Sun", color: "#8a84a3", values: terrain, unit: "°", digits: 2 } } : {}),
      bands: [{ label: "DAY", color: SUN, on: lit }, { label: "EARTH", color: EARTH, on: seen }],
      powerSeries: [{ id: "power", label: "Power", color: SUN, values: power, unit: " W", digits: 1, area: true }],
      powerDomain: [0, niceCeil(peak)] as [number, number],
    };
  }, [samples, area, eff, endMs]);
  const seek = (x: number) => setElapsed((x - startMs) / 3_600_000);
  const fmtTick = samples.length > 72 ? fmtDay : (ms: number) => new Date(ms).toISOString().slice(11, 16);
  const series = focus === "earth" ? [d.earthSeries] : focus === "power" ? d.powerSeries : [d.sunSeries];
  const bands = focus === "earth" ? [d.bands[1]] : focus === "sunlight" ? [d.bands[0]] : [];
  const title = focus === "earth" ? "Earth above the horizon" : focus === "power" ? "Estimated solar power" : "Sun above the horizon";
  const windows = focus === "earth" ? d.contact : d.daylight;
  const gaps = focus === "earth" ? d.blackout : d.night;
  const active = windows.find((window) => window.startMs <= tMs && tMs < window.endMs);
  const next = windows.find((window) => window.startMs > tMs);
  const summary = focus === "earth" ? `Earth line of sight is available for about ${fmtDuration(windowHours(d.contact))} of this period.`
    : focus === "power" ? `Estimated energy over this time: ${d.energyKWh.toFixed(1)} kWh.`
    : `Daylight lasts about ${fmtDuration(windowHours(d.daylight))} in total over this period.`;

  const exportCsv = () => downloadCsv(`${siteId}_${new Date(startMs).toISOString().slice(0, 10)}_daily.csv`,
    ["time_utc", "sun_azimuth_deg", "sun_elevation_deg", "terrain_at_sun_deg", "earth_azimuth_deg", "earth_elevation_deg", "terrain_at_earth_deg", "solar_power_w"],
    samples.map((s, i) => [new Date(s.t).toISOString(), s.sunAz.toFixed(4), s.sunEl.toFixed(4), s.sunHorizon.toFixed(3), s.earthAz.toFixed(4), s.earthEl.toFixed(4), s.earthHorizon.toFixed(3), d.power[i].toFixed(2)]));

  return <div className="flex flex-col gap-3">
    <p className="text-sm text-bone">{summary}</p>
    <h3 className="type-heading text-base text-bone">{title}</h3>
    <TimeSeriesChart title={title} xs={d.xs} yUnit={focus === "power" ? "W" : "°"} zeroLine={focus !== "power"} cursorX={tMs} onSeek={seek} formatX={fmtTime} formatTick={fmtTick}
      yDomain={focus === "power" ? d.powerDomain : undefined} series={series} bands={bands} />
    {focus !== "power" && <section aria-label={focus === "earth" ? "Communication window durations" : "Daylight durations"} className="rounded-md border border-line p-3 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><p className="text-muted-foreground">Longest {focus === "earth" ? "contact" : "daylight"} window</p><p className="type-data text-bone">≈ {fmtDuration(longestWindowHours(windows))}</p></div>
        <div><p className="text-muted-foreground">Longest {focus === "earth" ? "blackout" : "night"}</p><p className="type-data text-bone">≈ {fmtDuration(longestWindowHours(gaps))}</p></div>
        <div><p className="text-muted-foreground">{active ? "Remaining in this window" : "Next window starts in"}</p><p className="type-data text-bone">{active ? `≈ ${fmtDuration((active.endMs - tMs) / 3_600_000)}` : next ? `≈ ${fmtDuration((next.startMs - tMs) / 3_600_000)}` : "Beyond this period"}</p></div>
      </div>
      <details className="mt-3"><summary className="cursor-pointer text-muted-foreground">{windows.length} {focus === "earth" ? "communication" : "daylight"} windows · start, end & duration</summary>
        <div className="mt-2"><WindowList windows={windows} accent={focus === "earth" ? "text-retro-blue" : "text-retro-red"} emptyText={focus === "earth" ? "No Earth contact in this period." : "No daylight in this period."} max={windows.length} /></div>
      </details>
      <p className="mt-2 text-xs text-muted-foreground">Estimated from {fmtDuration(d.stepMs / 3_600_000)} samples, clipped to the selected period. A window may continue outside this range.{focus === "earth" ? " Earth line of sight does not guarantee a working radio link." : ""}</p>
    </section>}
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer hover:text-bone">Download data</summary>
      <button type="button" onClick={exportCsv} className="mt-2 inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:text-bone"><Download size={15} />Download CSV</button>
      {focus === "power" && <p className="mt-2">Power estimate uses a flat {area} m² panel at {Math.round(eff * 100)}% efficiency.</p>}
    </details>
  </div>;
}

/** One point per lunar day across a year from the mission start: shows seasonal change at polar sites. */
export function YearlyGraphs({ samples, siteId, startMs, tMs, missionEndMs, focus }: { samples: Sample[]; siteId: string; startMs: number; tMs: number; missionEndMs: number; focus: Exclude<GraphFocus, "power"> }) {
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const days = useMemo(() => summarizeByLunarDay(samples).filter((d) => d.complete), [samples]);
  const c = useMemo(() => {
    const sunlight = Float64Array.from(days, (d) => d.sunlightHours);
    const earthPct = Float64Array.from(days, (d) => d.earthVisiblePct);
    const earthHours = Float64Array.from(days, (d) => d.earthVisiblePct / 100 * (d.endMs - d.startMs) / 3_600_000);
    return {
      xs: Float64Array.from(days, (d) => d.startMs), sunlight, earthPct, earthHours,
      sunlightSeries: [{ id: "sun-h", label: "Sunlight", color: SUN, values: sunlight, unit: " h", digits: 0 }],
      earthSeries: [{ id: "earth-pct", label: "Earth contact", color: EARTH, values: earthHours, unit: " h", digits: 0 }],
    };
  }, [days]);
  if (days.length < 2) return <p className="text-xs text-muted-foreground">Not enough data for a yearly view.</p>;
  const { xs, sunlight, earthHours } = c;

  const label = (ms: number) => {
    const d = days.find((x) => x.startMs === ms);
    return d ? `Lunar day ${d.index + 1} · ${new Date(d.startMs).toISOString().slice(0, 10)}` : fmtTime(ms);
  };
  const seek = (x: number) => { if (x >= startMs && x <= missionEndMs) setElapsed((x - startMs) / 3_600_000); };
  const lunarDayH = (days[0].endMs - days[0].startMs) / 3_600_000;
  const sunlightDomain: [number, number] = [0, Math.ceil(lunarDayH / 100) * 100];
  const range = (a: Float64Array) => `${Math.min(...a).toFixed(0)}–${Math.max(...a).toFixed(0)}`;

  const exportCsv = () => downloadCsv(`${siteId}_${new Date(startMs).toISOString().slice(0, 10)}_yearly.csv`,
    ["lunar_day", "start_utc", "end_utc", "sunlight_hours", "max_sun_elevation_deg", "earth_visible_pct", "earth_contact_hours"],
    days.map((d) => [d.index + 1, new Date(d.startMs).toISOString(), new Date(d.endMs).toISOString(), d.sunlightHours, d.maxSunEl.toFixed(3), d.earthVisiblePct.toFixed(1), (d.earthVisiblePct / 100 * (d.endMs - d.startMs) / 3_600_000).toFixed(1)]));

  const common = { xs, cursorX: tMs, onSeek: seek, formatX: label, formatTick: fmtDay, markers: true, height: 180 } as const;
  const series = focus === "earth" ? c.earthSeries : c.sunlightSeries;
  const title = focus === "earth" ? "Hours of Earth contact each lunar day" : "Hours of sunlight each lunar day";
  const summary = focus === "earth" ? `Earth contact ranges from about ${range(earthHours)} hours per lunar day.`
    : `Sunlight ranges from ${range(sunlight)} hours per lunar day.`;
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-bone">{summary}</p>
    <h3 className="type-heading text-base text-bone">{title}</h3>
    <TimeSeriesChart {...common} title={title} yUnit="h" yDomain={sunlightDomain}
      series={series} />
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer hover:text-bone">Download data</summary>
      <button type="button" onClick={exportCsv} className="mt-2 inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:text-bone"><Download size={15} />Download CSV</button>
      <p className="mt-2">Showing {days.length} lunar days. Each is about {(lunarDayH / 24).toFixed(1)} Earth days long.</p>
    </details>
  </div>;
}
