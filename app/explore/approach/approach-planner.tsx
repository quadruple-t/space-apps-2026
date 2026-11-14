"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { MoonSunDiagram } from "@/components/graphics/moon-sun-diagram";
import { DailySunlightChart, IrradianceChart, SkyTrack } from "@/components/graphics/mission-charts";
import type { CatalogSite } from "@/data/sites";
import { COVERAGE_END_ISO, COVERAGE_START_ISO } from "@/lib/freeplay-store";
import {
  buildTimeline, earthUp, hoursUntilChange, sampleAt, summarizeByDay, sunUp,
  type PanelMode, type Sample,
} from "@/lib/illumination";
import { useLunarWindow } from "@/lib/use-lunar-data";

const STEP_HOURS = 1;
const MAX_DAYS = 366;
/** Simulated hours per real second. */
const SPEEDS = [
  { label: "1 h/s", value: 1 },
  { label: "6 h/s", value: 6 },
  { label: "1 day/s", value: 24 },
  { label: "1 wk/s", value: 168 },
  { label: "30 days/s", value: 720 },
];

type Mission = { name: string; lat: number; lon: number; catalogId?: string; startIso: string; days: number };
const DEFAULT_CATALOG_ID = "artemis-malapert-massif";
const EMPTY: Sample[] = [];

function fmtHours(h: number | null) {
  if (h === null) return "not in mission";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function Readout({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "sun" | "earth" }) {
  const dot = tone === "sun" ? <span className="text-retro-red">● </span> : tone === "earth" ? <span className="text-retro-blue">○ </span> : null;
  return <div className="hud-readout">
    <div className="hud-label">{dot}{label}</div>
    <div className="type-data mt-1 text-sm text-bone tabular-nums">{value}</div>
    {sub && <div className="type-data mt-0.5 text-[0.58rem] text-muted-foreground">{sub}</div>}
  </div>;
}

export function ApproachPlanner() {
  const params = useSearchParams();
  const qLat = params.get("lat"), qLon = params.get("lon");
  const fromQuery = qLat !== null && qLon !== null;

  // ── Setup form ─────────────────────────────────────────────────────────────
  // Site list: the Lunaris360 catalog (catalog sites have LOLA horizon masks).
  const [catalog, setCatalog] = useState<CatalogSite[]>([]);
  const [siteId, setSiteId] = useState(fromQuery ? "custom" : DEFAULT_CATALOG_ID);
  const [name, setName] = useState(params.get("name") ?? "");
  const [lat, setLat] = useState(qLat ?? "");
  const [lon, setLon] = useState(qLon ?? "");
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/catalog/sites").then((r) => r.json()).then((j: { sites?: CatalogSite[] }) => {
      if (!alive || !j.sites) return;
      setCatalog(j.sites);
      const first = j.sites.find((c) => c.id === DEFAULT_CATALOG_ID) ?? j.sites[0];
      if (!fromQuery && first) { setName(first.name); setLat(String(first.latDeg)); setLon(String(first.lonDeg)); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [fromQuery]);
  const [startDate, setStartDate] = useState("2026-12-01");
  const [startTime, setStartTime] = useState("00:00");
  const [days, setDays] = useState("30");
  const [panel, setPanel] = useState<PanelMode>("vertical");
  const [formError, setFormError] = useState<string | null>(null);

  // ── Mission data ───────────────────────────────────────────────────────────
  const [mission, setMission] = useState<Mission | null>(null);
  const missionSite = useMemo(() => mission && { catalogId: mission.catalogId, latitudeDeg: mission.lat, longitudeDeg: mission.lon }, [mission]);
  const lunar = useLunarWindow(missionSite, mission?.startIso ?? COVERAGE_START_ISO, (mission?.days ?? 1) * 24, !!mission);
  const samples = lunar.data?.samples ?? EMPTY;
  const loading = lunar.loading;
  const fetchError = lunar.error;

  // ── Playback ───────────────────────────────────────────────────────────────
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(24);

  const pickSite = (id: string) => {
    setSiteId(id);
    const c = catalog.find((v) => v.id === id);
    if (c) { setName(c.name); setLat(String(c.latDeg)); setLon(String(c.lonDeg)); }
  };

  const run = (m: Mission) => { setPlaying(false); setIndex(0); setMission(m); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const la = Number(lat), loRaw = Number(lon), d = Number(days);
    const startMs = Date.parse(`${startDate}T${startTime || "00:00"}:00Z`);
    if (lat.trim() === "" || !Number.isFinite(la) || la < -90 || la > 90) return setFormError("Latitude must be between −90 and +90.");
    if (lon.trim() === "" || !Number.isFinite(loRaw) || loRaw < -180 || loRaw > 360) return setFormError("Longitude must be between −180 and 360 (east-positive).");
    if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) return setFormError(`Mission length must be a whole number of days from 1 to ${MAX_DAYS}.`);
    if (Number.isNaN(startMs)) return setFormError("Enter a valid start date and time.");
    if (startMs < Date.parse(COVERAGE_START_ISO) || startMs + d * 86_400_000 > Date.parse(COVERAGE_END_ISO)) {
      return setFormError("The stored ephemeris covers 2026-01-01 to 2030-12-31. Pick a mission inside that window.");
    }
    setFormError(null);
    const lo = ((loRaw % 360) + 360) % 360;
    run({ name: name.trim() || "Custom site", lat: la, lon: lo, catalogId: siteId === "custom" ? undefined : siteId, startIso: new Date(startMs).toISOString(), days: d });
  };

  // ── Derived analysis ───────────────────────────────────────────────────────
  const timeline = useMemo(() => buildTimeline(samples, STEP_HOURS, panel), [samples, panel]);
  const daily = useMemo(() => summarizeByDay(samples, timeline), [samples, timeline]);
  const last = samples.length - 1;

  // ── Playback loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || last < 1) return;
    let raf = 0, prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setIndex((i) => {
        const next = i + (dt * speed) / STEP_HOURS;
        if (next >= last) { setPlaying(false); return last; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last]);

  const seek = (t: number) => {
    if (!samples.length) return;
    setIndex(Math.max(0, Math.min(last, (t - samples[0].t) / (STEP_HOURS * 3_600_000))));
  };

  const cur = samples.length ? sampleAt(samples, index) : null;
  const i = Math.floor(index);
  const elapsed = samples.length ? (cur!.t - samples[0].t) / 3_600_000 : 0;
  const litSoFar = samples.length ? timeline.cumSunHours[i] : 0;
  const earthSoFar = samples.length ? timeline.cumEarthHours[i] : 0;
  const totalHours = samples.length * STEP_HOURS;

  return <div className="min-h-dvh bg-void px-4 pb-16 pt-[calc(var(--nav-height)+1.5rem)] sm:px-6">
    <div className="mx-auto max-w-[1240px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/explore" className="type-data inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-bone"><ArrowLeft size={13} /> Freeplay</Link>
          <h1 className="type-heading mt-2 text-2xl text-bone sm:text-4xl">Approach geometry</h1>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">Pick a site, a landing date and a mission length. Sun and Earth positions come from the team&apos;s stored JPL Horizons ephemeris (2026–2030), hour by hour, and catalog sites use their LOLA terrain horizon. Play it back at any speed to see how much sunlight the site gets, and how strong it is.</p>
        </div>
        <span className="rounded border border-retro-blue/40 bg-retro-blue/10 px-2 py-1 type-data text-[0.56rem] uppercase text-retro-blue">{lunar.data ? `Lunaris360 data · terrain: ${lunar.data.horizon.elevationsDeg ? lunar.data.horizon.source : "smooth horizon (upper bound)"}` : "Lunaris360 data · stored JPL Horizons + LOLA"}</span>
      </header>

      {/* ── Setup ── */}
      <form onSubmit={submit} className="hud-panel grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.6fr_0.6fr_auto] lg:items-end">
        <label className="text-[0.58rem] text-muted-foreground">Site
          <select value={siteId} onChange={(e) => pickSite(e.target.value)} className="hud-input mt-1">
            {catalog.length === 0 && siteId !== "custom" && <option value={siteId}>Loading catalog…</option>}
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.pointIsApproximate ? " (approx.)" : ""}</option>)}
            <option value="custom">Custom coordinates…</option>
          </select>
        </label>
        <label className="text-[0.58rem] text-muted-foreground">Latitude °
          <input inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value); setSiteId("custom"); }} className="hud-input mt-1" />
        </label>
        <label className="text-[0.58rem] text-muted-foreground">Longitude °E
          <input inputMode="decimal" value={lon} onChange={(e) => { setLon(e.target.value); setSiteId("custom"); }} className="hud-input mt-1" />
        </label>
        <label className="text-[0.58rem] text-muted-foreground">Start (UTC)
          <div className="mt-1 flex gap-1">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="hud-input" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="hud-input w-[5.5rem]" />
          </div>
        </label>
        <label className="text-[0.58rem] text-muted-foreground">Mission (days)
          <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="hud-input mt-1" />
        </label>
        <fieldset className="text-[0.58rem] text-muted-foreground">
          <legend>Solar panel</legend>
          <div className="mt-1 flex overflow-hidden rounded border border-line">
            {(["vertical", "horizontal"] as const).map((m) => <button key={m} type="button" onClick={() => setPanel(m)} aria-pressed={panel === m}
              className={`flex-1 px-2 py-[0.45rem] text-[0.62rem] capitalize ${panel === m ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{m}</button>)}
          </div>
        </fieldset>
        <button type="submit" disabled={loading} className="rounded bg-retro-red px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-void hover:bg-[#ff91a2] disabled:opacity-60">{loading ? "Fetching…" : "Run mission"}</button>
        {formError && <p role="alert" className="text-[0.62rem] text-destructive sm:col-span-2 lg:col-span-7">{formError}</p>}
        <p className="text-[0.58rem] leading-relaxed text-muted-foreground sm:col-span-2 lg:col-span-7">
          {panel === "vertical"
            ? "Vertical: an upright panel that turns to face the Sun, the usual design near the poles where the Sun stays low. Intensity scales with cos(elevation)."
            : "Horizontal: a flat panel on the ground. Intensity scales with sin(elevation), so a low polar Sun delivers very little."}
          {" "}Both use 1361 W/m² corrected for the Sun&apos;s distance on each hour.
        </p>
      </form>

      {fetchError && <p role="alert" className="hud-panel mt-3 p-3 text-xs text-destructive">Couldn&apos;t load ephemeris: {fetchError}</p>}
      {loading && <p className="type-data mt-4 animate-pulse text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Loading {days} days of stored ephemeris and the site&apos;s terrain horizon…</p>}

      {!samples.length && !loading && !fetchError && <p className="mt-6 text-sm text-muted-foreground">Set up a mission above and press <span className="text-bone">Run mission</span>. Any mission inside 2026–2030 loads in a few seconds.</p>}

      {cur && mission && <>
        {/* ── Playback ── */}
        <section className="hud-panel mt-3 flex flex-wrap items-center gap-3 p-3" aria-label="Playback">
          <button type="button" onClick={() => { if (index >= last) setIndex(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}
            className="grid size-9 place-items-center rounded bg-retro-red text-void hover:bg-[#ff91a2]">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" onClick={() => { setIndex(0); setPlaying(false); }} aria-label="Restart" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><RotateCcw size={15} /></button>
          <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => <button key={s.value} type="button" onClick={() => setSpeed(s.value)} aria-pressed={speed === s.value}
              className={`type-data px-2.5 py-2 text-[0.6rem] ${speed === s.value ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{s.label}</button>)}
          </div>
          <input type="range" min={0} max={last} step={0.01} value={index} onChange={(e) => setIndex(Number(e.target.value))} aria-label="Mission time"
            className="min-w-[180px] flex-1 accent-[#ff5364]" />
          <div className="type-data text-right text-[0.65rem] text-bone tabular-nums">
            {new Date(cur.t).toISOString().slice(0, 16).replace("T", " ")} UTC
            <div className="text-[0.58rem] text-muted-foreground">day {(elapsed / 24 + 1).toFixed(1)} of {mission.days}</div>
          </div>
        </section>

        {/* ── Readouts ── */}
        <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Mission readouts">
          <Readout tone="sun" label="Sun elevation" value={`${cur.sunEl.toFixed(2)}°`} sub={sunUp(cur) ? `sets in ${fmtHours(hoursUntilChange(samples, index, STEP_HOURS, "sun"))}` : `rises in ${fmtHours(hoursUntilChange(samples, index, STEP_HOURS, "sun"))}`} />
          <Readout tone="sun" label="Intensity now" value={`${timeline.irradiance[i].toFixed(0)} W/m²`} sub={`${panel} panel · Sun at ${cur.sunRangeAu.toFixed(4)} AU`} />
          <Readout tone="sun" label="Sunlight so far" value={`${litSoFar.toFixed(0)} h`} sub={`${elapsed > 0 ? ((litSoFar / Math.max(STEP_HOURS, elapsed)) * 100).toFixed(0) : 0}% · longest dark ${fmtHours(timeline.longestDarkHours[i])}`} />
          <Readout tone="sun" label="Energy so far" value={`${timeline.cumEnergyKWh[i].toFixed(1)} kWh/m²`} sub={`mission total ${timeline.cumEnergyKWh[last].toFixed(1)} kWh/m²`} />
          <Readout tone="earth" label="Earth elevation" value={`${cur.earthEl.toFixed(2)}°`} sub={earthUp(cur) ? `sets in ${fmtHours(hoursUntilChange(samples, index, STEP_HOURS, "earth"))}` : `rises in ${fmtHours(hoursUntilChange(samples, index, STEP_HOURS, "earth"))}`} />
          <Readout tone="earth" label="Earth contact so far" value={`${earthSoFar.toFixed(0)} h`} sub={`longest blackout ${fmtHours(timeline.longestBlackoutHours[i])}`} />
        </section>

        {/* ── Geometry ── */}
        <section className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <MoonSunDiagram latitudeDeg={mission.lat} longitudeDeg={mission.lon} sunAzimuthDeg={cur.sunAz} sunElevationDeg={cur.sunEl} earthAzimuthDeg={cur.earthAz} earthElevationDeg={cur.earthEl}
            caption={`${mission.name} · ${mission.lat.toFixed(3)}°, ${mission.lon.toFixed(3)}° E. Angles from stored JPL Horizons ephemeris (Lunaris360 data); dimmed bodies are below the horizon.`} />
          <div className="hud-panel p-3 sm:p-4">
            <div className="type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-purple">Horizon view</div>
            <div className="mt-1 text-xs text-bone">Sun and Earth against the local horizon, Sun track over the last 24 h</div>
            <div className="mt-2"><SkyTrack samples={samples} index={index} current={cur} terrain={lunar.data?.horizon} /></div>
          </div>
        </section>

        {/* ── Charts ── */}
        <section className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="hud-panel p-3 sm:p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="type-heading text-sm text-bone">Sunlight hours per day</h2>
              <span className="type-data text-[0.6rem] text-muted-foreground">{timeline.cumSunHours[last].toFixed(0)} h of {totalHours} h ({((timeline.cumSunHours[last] / totalHours) * 100).toFixed(0)}%)</span>
            </div>
            <div className="mt-2"><DailySunlightChart days={daily} cursorT={cur.t} onSeek={seek} /></div>
          </div>
          <div className="hud-panel p-3 sm:p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="type-heading text-sm text-bone">Solar intensity on a {panel} panel (W/m²)</h2>
              <span className="type-data text-[0.6rem] text-muted-foreground">{timeline.cumEnergyKWh[last].toFixed(1)} kWh/m² total</span>
            </div>
            <div className="mt-2"><IrradianceChart samples={samples} timeline={timeline} cursorT={cur.t} onSeek={seek} /></div>
          </div>
        </section>

        {/* ── Table view ── */}
        <details className="hud-panel mt-3 p-3 sm:p-4">
          <summary className="cursor-pointer text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-bone">Daily table ({daily.length} days)</summary>
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="type-data w-full text-left text-[0.62rem] tabular-nums">
              <thead className="sticky top-0 bg-void text-muted-foreground"><tr><th className="py-1 pr-3">Date (UTC)</th><th className="pr-3">Sunlight h</th><th className="pr-3">Earth visible h</th><th className="pr-3">Peak W/m²</th><th>kWh/m²</th></tr></thead>
              <tbody className="text-bone">{daily.map((d) => <tr key={d.dayStart} className="border-t border-line/60">
                <td className="py-1 pr-3">{new Date(d.dayStart).toISOString().slice(0, 10)}</td><td className="pr-3">{d.sunlightHours}</td><td className="pr-3">{d.earthHours}</td><td className="pr-3">{d.peakIrradiance.toFixed(0)}</td><td>{d.energyKWh.toFixed(2)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}
    </div>
  </div>;
}
