"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Clock3, Crosshair, Globe2, Map, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { CameraMode } from "@/scenes/lunar/camera-rig";
import { mockScienceProvider } from "@/integrations/science/mock-provider";
import type { CelestialState, LunarSite, MissionMetrics } from "@/integrations/science/types";
import { interpolateTerrain, MOON_REGIONS, SCAFFOLD_MOON_GRID, type TerrainSample } from "@/integrations/terrain/moon-samples";
import { MoonLocationPicker } from "./moon-location-picker";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const LunarScene = dynamic(() => import("@/scenes/lunar/lunar-scene"), { ssr: false });
const initialTime = new Date("2026-11-14T12:00:00.000Z");
const isoMinute = (date: Date) => date.toISOString().slice(0, 16);
const angle = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}°`;
const localTime = (date: Date) => `${date.toISOString().slice(0, 10)} · ${date.toISOString().slice(11, 16)} UTC`;

function Readout({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "blue" }) {
  const color = tone === "red" ? "text-retro-red" : tone === "blue" ? "text-retro-blue" : "text-bone";
  return <div className="hud-readout"><div className="hud-label">{label}</div><div className={`type-data mt-1 text-sm ${color}`}>{value}</div></div>;
}

export function Freeplay() {
  const [site, setSite] = useState<LunarSite>(MOON_REGIONS[0].site);
  const [activeSite, setActiveSite] = useState<LunarSite>(MOON_REGIONS[0].site);
  const [phase, setPhase] = useState<"choose" | "transfer" | "descent" | "explore">("choose");
  const [timestamp, setTimestamp] = useState(initialTime);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [cameraMode, setCameraMode] = useState<CameraMode>("first-person");
  const [zoom, setZoom] = useState(1);
  const [celestial, setCelestial] = useState<CelestialState | null>(null);
  const [metrics, setMetrics] = useState<MissionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mobileTelemetryOpen, setMobileTelemetryOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const celestialRequest = useRef(0);
  const metricRequest = useRef(0);
  const metricsCache = useRef(new globalThis.Map<string, MissionMetrics>());
  const [deviceTier] = useState<"low" | "high">(() => typeof window !== "undefined" && window.innerWidth >= 768 && (navigator.hardwareConcurrency ?? 8) > 4 ? "high" : "low");

  const activeTerrain = useMemo(() => interpolateTerrain(SCAFFOLD_MOON_GRID, activeSite.latitudeDeg, activeSite.longitudeDeg), [activeSite.latitudeDeg, activeSite.longitudeDeg]);
  const environmentSite = useMemo(() => phase === "choose" ? site : activeSite, [phase, site, activeSite]);
  const utcDay = timestamp.toISOString().slice(0, 10);
  const updateCelestial = useCallback(async (selectedSite: LunarSite, date: Date) => {
    const request = ++celestialRequest.current;
    try {
      const result = await mockScienceProvider.getCelestialState(selectedSite, date.toISOString());
      if (request === celestialRequest.current) setCelestial(result);
    } catch {
      if (request === celestialRequest.current) { setCelestial(null); setDataError(true); }
    }
  }, []);
  const updateMetrics = useCallback(async (selectedSite: LunarSite, day: string) => {
    const request = ++metricRequest.current;
    const cacheKey = `${selectedSite.id}:${day}`;
    const cached = metricsCache.current.get(cacheKey);
    if (cached) { setMetrics(cached); setLoading(false); setDataError(false); return; }
    setLoading(true);
    setDataError(false);
    const startIso = `${day}T00:00:00.000Z`;
    try {
      const result = await mockScienceProvider.getMissionMetrics(selectedSite, startIso, 24);
      if (result) metricsCache.current.set(cacheKey, result);
      if (request === metricRequest.current) setMetrics(result);
    } catch {
      if (request === metricRequest.current) { setMetrics(null); setDataError(true); }
    } finally {
      if (request === metricRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void updateCelestial(environmentSite, timestamp); }, 0);
    return () => { window.clearTimeout(timer); celestialRequest.current += 1; };
  }, [environmentSite, timestamp, updateCelestial]);
  useEffect(() => {
    void updateMetrics(environmentSite, utcDay);
  }, [environmentSite, utcDay, updateMetrics]);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setTimestamp((time) => new Date(time.getTime() + speed * 60_000)), 250);
    return () => window.clearInterval(timer);
  }, [playing, speed, reducedMotion]);

  useEffect(() => {
    if (phase === "transfer") {
      const timer = window.setTimeout(() => { setCameraMode("first-person"); setPhase("descent"); }, 1450);
      return () => window.clearTimeout(timer);
    }
    if (phase === "descent") {
      const timer = window.setTimeout(() => setPhase("explore"), 1150);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  const selectDataPoint = useCallback((point: TerrainSample) => {
    const target: LunarSite = {
      id: `grid-${point.latitudeDeg}-${point.longitudeDeg}`,
      name: `Grid point · ${point.latitudeDeg}° / ${point.longitudeDeg}° E`,
      latitudeDeg: point.latitudeDeg,
      longitudeDeg: point.longitudeDeg,
      coordinateReference: "Planetocentric latitude, east-positive longitude",
      provenance: "illustrative",
    };
    setPlaying(false);
    setSite(target);
    setActiveSite(target);
    setCameraMode(reducedMotion ? "first-person" : "orbit");
    setPhase(reducedMotion ? "explore" : "transfer");
  }, [reducedMotion]);
  const beginDescent = () => {
    setPlaying(false);
    setActiveSite(site);
    setCameraMode(reducedMotion ? "first-person" : "orbit");
    setPhase(reducedMotion ? "explore" : "transfer");
  };
  const dayMinute = timestamp.getUTCHours() * 60 + timestamp.getUTCMinutes();
  const timeInput = useMemo(() => isoMinute(timestamp), [timestamp]);

  return <main className="relative isolate h-dvh w-full overflow-hidden bg-void text-bone" aria-label="Shadowline lunar simulation">
    <div className="absolute inset-0 z-0">
      <LunarScene variant="preview" active detail={deviceTier} still={reducedMotion} freeplay={phase !== "choose"} cameraMode={cameraMode} zoom={zoom}
        selectedSite={activeSite} dataPoints={activeTerrain.corners} onSelectDataPoint={selectDataPoint}
        sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg}
        earthAzimuthDeg={celestial?.earth.azimuthDeg} earthElevationDeg={celestial?.earth.elevationDeg}/>
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/50 via-transparent via-35% to-void/55"/>
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full bg-gradient-to-r from-void/35 via-transparent to-void/25"/>

    <header className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-2 sm:inset-x-5 sm:top-4">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 p-1.5 shadow-xl backdrop-blur-xl sm:gap-3 sm:p-2">
        <Link href="/" aria-label="Exit simulation to Shadowline home" className="grid size-9 shrink-0 place-items-center rounded-md bg-retro-purple/15 text-retro-purple transition hover:bg-retro-purple/25"><ArrowLeft size={17}/></Link>
        <div className="min-w-0 pr-2"><div className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Shadowline / Freeplay</div><div className="truncate text-xs font-medium text-bone">Lunar surface simulation</div></div>
        <span className="hidden h-8 w-px bg-line sm:block"/>
        {phase === "explore" && <button type="button" onClick={()=>setMapOpen((open)=>!open)} aria-expanded={mapOpen} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground hover:border-retro-purple/60 hover:text-bone sm:px-3"><Map size={14} className="text-retro-purple"/><span className="hidden sm:inline">{mapOpen?"Hide map":"Map & samples"}</span></button>}
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 px-3 py-2 shadow-xl backdrop-blur-xl sm:px-4">
        <span className="relative flex size-2">{!reducedMotion && <span className="absolute inline-flex size-full animate-ping rounded-full bg-retro-red opacity-50"/>}<span className="relative inline-flex size-2 rounded-full bg-retro-red"/></span>
        <div className="min-w-0"><div className="type-data text-[0.56rem] uppercase tracking-[0.12em] text-retro-red">{phase === "transfer" ? "Transferring" : phase === "descent" ? "Descending" : loading ? "Syncing" : "Demo data"}</div><div className="type-data truncate text-[0.62rem] text-bone sm:text-xs">{activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</div></div>
      </div>
    </header>

    {phase === "choose" && <MoonLocationPicker selectedSite={site} onSelect={setSite} onContinue={beginDescent} sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg}/>}

    {(phase === "transfer" || phase === "descent") && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-void/15 px-5 backdrop-blur-[1px]">
      <div className="w-full max-w-sm rounded-xl border border-retro-purple/40 bg-void/85 p-5 text-center shadow-[0_0_80px_rgba(169,134,255,0.16)] backdrop-blur-xl sm:p-7">
        <div className="type-data text-[0.62rem] uppercase tracking-[0.18em] text-retro-purple">Freeplay setup · step 2 of 2</div>
        <h2 className="type-heading mt-3 text-xl text-bone">{phase === "transfer" ? "Transferring to lunar orbit" : "Descending to surface"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{activeSite.name} · {activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full bg-gradient-to-r from-retro-purple via-retro-blue to-retro-red ${phase === "transfer" ? "w-2/5" : "w-4/5"} transition-[width] duration-1000`}/></div>
      </div>
    </div>}

    {phase === "explore" && mapOpen && <div className="absolute bottom-[7.4rem] left-3 top-[5.2rem] z-10 w-[min(360px,calc(100vw-1.5rem))] sm:bottom-24 sm:left-5 sm:top-[5.5rem]">
      <MoonLocationPicker mode="hud" selectedSite={site} onSelect={setSite} onContinue={beginDescent} sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg}/>
    </div>}

    {phase === "explore" && <aside className="absolute right-4 top-[5.5rem] z-10 hidden w-[276px] space-y-2.5 xl:block">
      <section className="hud-panel p-3.5">
        <div className="flex items-center justify-between"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-blue">Telemetry</div><h2 className="type-heading mt-1 text-sm text-bone">Local conditions</h2></div><Activity size={15} className="text-retro-blue"/></div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Readout label="Sun elevation" value={celestial?angle(celestial.sun.elevationDeg):"—"} tone="red"/>
          <Readout label="Sun azimuth" value={celestial?`${celestial.sun.azimuthDeg.toFixed(1)}°`:"—"} tone="red"/>
          <Readout label="Earth elevation" value={celestial?angle(celestial.earth.elevationDeg):"—"} tone="blue"/>
          <Readout label="Earth azimuth" value={celestial?`${celestial.earth.azimuthDeg.toFixed(1)}°`:"—"} tone="blue"/>
          <Readout label="Elevation · scaffold" value={`${Math.round(activeTerrain.elevationMeters).toLocaleString()} m`}/>
          <Readout label="Slope · scaffold" value={`${activeTerrain.slopeDeg.toFixed(1)}°`}/>
        </div>
        <div className="mt-3 border-t border-line/80 pt-2 text-[0.58rem] text-muted-foreground">{dataError?"Science provider unavailable":"Illustrative science provider · no LOLA terrain connected"}</div>
      </section>
      <section className="hud-panel p-3.5">
        <div className="flex items-center justify-between"><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-purple">Mission window · 24 h</div><span className="type-data rounded border border-retro-red/35 px-1.5 py-0.5 text-[0.5rem] uppercase text-retro-red">Illustrative</span></div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <Readout label="Sunlit duration" value={metrics?`${metrics.sunlightHours} h`:"—"} tone="red"/>
          <Readout label="Sunlit share" value={metrics?`${metrics.sunlightPercent}%`:"—"} tone="red"/>
          <Readout label="Earth visibility" value={metrics?`${metrics.earthVisibilityPercent}%`:"—"} tone="blue"/>
          <Readout label="Longest blackout" value={metrics?`${metrics.longestBlackoutHours} h`:"—"} tone="blue"/>
        </div>
      </section>
    </aside>}

    {phase === "explore" && <button type="button" onClick={()=>setMobileTelemetryOpen((open)=>!open)} aria-expanded={mobileTelemetryOpen} className="absolute right-3 top-[4.9rem] z-20 grid size-10 place-items-center rounded-lg border border-line bg-void/75 text-retro-blue shadow-xl backdrop-blur-xl xl:hidden" aria-label="Toggle telemetry"><Activity size={17}/></button>}
    {phase === "explore" && mobileTelemetryOpen && <aside className="hud-panel absolute right-3 top-[7.9rem] z-20 w-[min(290px,calc(100vw-1.5rem))] p-3 xl:hidden">
      <div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-blue">Local conditions</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5"><Readout label="Sun elevation" value={celestial?angle(celestial.sun.elevationDeg):"—"} tone="red"/><Readout label="Sun azimuth" value={celestial?`${celestial.sun.azimuthDeg.toFixed(1)}°`:"—"} tone="red"/><Readout label="Earth elevation" value={celestial?angle(celestial.earth.elevationDeg):"—"} tone="blue"/><Readout label="Elevation" value={`${Math.round(activeTerrain.elevationMeters).toLocaleString()} m`}/></div>
    </aside>}

    {phase === "explore" && <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] hidden -translate-x-1/2 -translate-y-1/2 sm:block">
      <div className="relative size-7"><span className="absolute left-1/2 top-0 h-2 -translate-x-1/2 border-l border-retro-purple/70"/><span className="absolute bottom-0 left-1/2 h-2 -translate-x-1/2 border-l border-retro-purple/70"/><span className="absolute left-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70"/><span className="absolute right-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70"/><span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-retro-red shadow-[0_0_12px_3px_rgba(255,99,125,0.5)]"/></div>
    </div>}
    {phase === "explore" && <div className="pointer-events-none absolute bottom-[6.9rem] right-5 z-[2] hidden items-center gap-2 rounded border border-line/70 bg-void/45 px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur sm:flex"><Crosshair size={13} className="text-retro-purple"/>Drag to look · click glowing grid nodes</div>}

    {phase === "explore" && <section aria-label="Simulation controls" className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-retro-purple/25 bg-void/88 px-3 py-2.5 shadow-[0_20px_90px_rgba(4,2,18,0.65)] backdrop-blur-2xl sm:inset-x-auto sm:left-1/2 sm:w-[min(790px,calc(100vw-400px))] sm:min-w-[560px] sm:-translate-x-1/2 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
          {([["first-person","Walk"],["orbit","Orbit"],["overhead","Map"]] as const).map(([mode,label])=><button key={mode} type="button" onClick={()=>setCameraMode(mode)} aria-pressed={cameraMode===mode} className={`rounded-md px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.08em] transition ${cameraMode===mode?"bg-retro-purple/20 text-retro-purple":"text-muted-foreground hover:text-bone"}`}>{label}</button>)}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
          <button type="button" aria-label="Zoom out" onClick={()=>setZoom((value)=>Math.min(1.8,value+0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomOut size={15}/></button>
          <button type="button" aria-label="Reset view" onClick={()=>{setZoom(1);setCameraMode("first-person");}} className="rounded p-1.5 text-bone hover:bg-white/10"><RotateCcw size={14}/></button>
          <button type="button" aria-label="Zoom in" onClick={()=>setZoom((value)=>Math.max(0.5,value-0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomIn size={15}/></button>
        </div>
        <div className="type-data flex items-center gap-2 text-[0.62rem] text-muted-foreground sm:ml-auto"><Clock3 size={14} className="text-retro-red"/><span>{localTime(timestamp)}</span></div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 sm:gap-3">
        <button type="button" disabled={reducedMotion} onClick={()=>setPlaying((value)=>!value)} className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-retro-red px-3 text-[0.63rem] font-semibold uppercase tracking-[0.1em] text-void transition hover:bg-[#ff91a2] disabled:cursor-not-allowed disabled:opacity-50" aria-label={playing?"Pause simulation":"Play simulation"} title={reducedMotion ? "Autoplay is paused by your reduced-motion setting" : undefined}>{playing?<Pause size={14}/>:<Play size={14}/>}<span className="hidden sm:inline">{playing?"Pause":"Run time"}</span></button>
        <label className="sr-only" htmlFor="playback-speed">Playback speed</label><select id="playback-speed" value={speed} onChange={(event)=>setSpeed(Number(event.target.value))} className="h-9 rounded-lg border border-line bg-void px-2 text-[0.62rem] text-bone"><option value={15}>15×</option><option value={60}>60×</option><option value={240}>240×</option></select>
        <input aria-label="Simulation time of day in UTC" type="range" min={0} max={1439} value={dayMinute} onChange={(event)=>setTimestamp((date)=>{const next=new Date(date);next.setUTCHours(0,Number(event.target.value),0,0);return next;})} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#ff637d]"/>
        <label className="sr-only" htmlFor="simulation-date">Simulation date and time in UTC</label><input id="simulation-date" type="datetime-local" value={timeInput} onChange={(event)=>{const value=new Date(`${event.target.value}:00Z`);if(!Number.isNaN(value.getTime()))setTimestamp(value);}} className="h-9 w-[9.2rem] rounded-lg border border-line bg-void px-2 text-[0.6rem] text-bone [color-scheme:dark]"/>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2 text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Globe2 size={12} className="text-retro-blue"/>Procedural terrain · illustrative demo data</span><span className="hidden sm:inline">{loading?"Updating environment":dataError?"Provider unavailable":"Demo data"}</span></div>
    </section>}
  </main>;
}
