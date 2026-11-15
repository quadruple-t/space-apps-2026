"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Crosshair, FastForward, Globe2, Map, Pause, Play, RotateCcw, ZoomIn, ZoomOut, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { CameraMode } from "@/scenes/lunar/camera-rig";
import { apiScienceProvider as scienceProvider } from "@/integrations/science/api-provider";
import type { CelestialState, LunarSite, MissionMetrics } from "@/integrations/science/types";
import { interpolateTerrain, MOON_REGIONS, terrainGridForSite, type TerrainSample } from "@/integrations/terrain/moon-samples";
import { MoonLocationPicker } from "./moon-location-picker";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { LessonCard, lessonActionClass, lessonCheckClass, type LessonStage } from "@/app/mission/lesson-card";
import { SURFACE_LESSON } from "@/app/mission/tutorial-content";
import { LessonExampleActivity } from "@/app/mission/lesson-example-activity";
import type { TutorialData } from "@/app/mission/use-tutorial-data";
import { lunarSiteFor, siteFromDriveParams, timeFromDriveParams } from "@/lib/drive-link";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";

const LunarScene = dynamic(() => import("@/scenes/lunar/lunar-scene"), { ssr: false });
const initialTime = new Date("2026-11-14T12:00:00.000Z");
const angle = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}°`;
const localTime = (date: Date) => `${date.toISOString().slice(0, 10)} · ${date.toISOString().slice(11, 16)} UTC`;

function Readout({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "blue" }) {
  const color = tone === "red" ? "text-retro-red" : tone === "blue" ? "text-retro-blue" : "text-bone";
  return <div className="hud-readout"><div className="text-xs leading-snug text-muted-foreground">{label}</div><div className={`type-data mt-1 text-base ${color}`}>{value}</div></div>;
}

/** `guided` runs the final Guided Mission lesson at the selected site and mission time. */
export function SurfaceDrive({ guided = false, tutorial, startSite, startUtc, onBack, onGuidedExit }: { guided?: boolean; tutorial?: TutorialData; startSite?: LunarSite; startUtc?: string; onBack?: () => void; onGuidedExit?: () => void }) {
  // Start at the site and time chosen in Freeplay (URL first, so reloads and shared links work).
  const params = useSearchParams();
  const [start] = useState(() => {
    const fp = useFreeplay.getState();
    return {
      site: startSite ?? siteFromDriveParams(params) ?? (fp.site ? lunarSiteFor(fp.site) : null),
      time: (startUtc && !Number.isNaN(Date.parse(startUtc)) ? new Date(startUtc) : null)
        ?? timeFromDriveParams(params) ?? (fp.site ? new Date(currentTimeMs(fp)) : initialTime),
    };
  });
  const [pickHere, setPickHere] = useState(false);
  const [site, setSite] = useState<LunarSite>(start.site ?? MOON_REGIONS[0].site);
  const [activeSite, setActiveSite] = useState<LunarSite>(start.site ?? MOON_REGIONS[0].site);
  const [phase, setPhase] = useState<"choose" | "transfer" | "descent" | "explore">(start.site ? "transfer" : "choose");
  const [timestamp, setTimestamp] = useState(start.time);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);
  const [cameraMode, setCameraMode] = useState<CameraMode>(start.site ? "orbit" : "first-person");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(Date.UTC(start.time.getUTCFullYear(), start.time.getUTCMonth(), 1)));
  const [zoom, setZoom] = useState(1);
  const [celestial, setCelestial] = useState<CelestialState | null>(null);
  const [metrics, setMetrics] = useState<MissionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mobileTelemetryOpen, setMobileTelemetryOpen] = useState(false);
  const [tutorialActions, setTutorialActions] = useState<Set<string>>(new Set());
  const [horizon, setHorizon] = useState<{ siteId: string; peak: { elevationDeg: number; azimuthDeg: number } | null } | null>(null);
  const [guidedComplete, setGuidedComplete] = useState(false);
  const [guidedStage, setGuidedStage] = useState<LessonStage>("story");
  const [lookSensitivity, setLookSensitivity] = useState(1);
  const reducedMotion = useReducedMotion();
  const celestialRequest = useRef(0);
  const metricRequest = useRef(0);
  const metricsCache = useRef(new globalThis.Map<string, MissionMetrics>());
  const [deviceTier] = useState<"low" | "high">(() => typeof window !== "undefined" && window.innerWidth >= 768 && (navigator.hardwareConcurrency ?? 8) > 4 ? "high" : "low");

  const recordTutorialAction = useCallback((action: string) => {
    setTutorialActions((current) => current.has(action) ? current : new Set(current).add(action));
  }, []);
  const chapter = tutorial?.chapters[SURFACE_LESSON.chapterId];
  const horizonPeak = horizon?.siteId === activeSite.id ? horizon.peak : undefined;
  const lessonComplete = ["look", "move", "camera", "horizon"].every((action) => tutorialActions.has(action));

  const activeTerrain = useMemo(() => interpolateTerrain(terrainGridForSite(activeSite), activeSite.latitudeDeg, activeSite.longitudeDeg), [activeSite]);
  const environmentSite = useMemo(() => phase === "choose" ? site : activeSite, [phase, site, activeSite]);
  const displayElevation = environmentSite.provenance === "scientific" && environmentSite.elevationMeters != null ? environmentSite.elevationMeters : activeTerrain.elevationMeters;
  const displaySlope = environmentSite.provenance === "scientific" && environmentSite.slopeDeg != null ? environmentSite.slopeDeg : activeTerrain.slopeDeg;
  const terrainLabel = environmentSite.provenance === "scientific" ? "LOLA DEM" : "Scaffold";
  const utcDay = timestamp.toISOString().slice(0, 10);
  const updateCelestial = useCallback(async (selectedSite: LunarSite, date: Date) => {
    const request = ++celestialRequest.current;
    try {
      const result = await scienceProvider.getCelestialState(selectedSite, date.toISOString());
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
      const result = await scienceProvider.getMissionMetrics(selectedSite, startIso, 24);
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
    if (!guided) return;
    let current = true;
    scienceProvider.getHorizon(activeSite).then((profile) => {
      if (!current) return;
      const elevationDeg = profile ? Math.max(...profile.elevationsDeg) : null;
      setHorizon({ siteId: activeSite.id, peak: profile && elevationDeg !== null ? { elevationDeg, azimuthDeg: profile.elevationsDeg.indexOf(elevationDeg) * profile.azimuthStepDeg } : null });
    }).catch(() => { if (current) setHorizon(null); });
    return () => { current = false; };
  }, [guided, activeSite]);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setTimestamp((time) => new Date(time.getTime() + speed * 60 * 60 * 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, speed, reducedMotion]);

  useEffect(() => {
    if (phase === "transfer") {
      const timer = window.setTimeout(() => { setCameraMode("first-person"); setPhase("descent"); }, 1450);
      return () => window.clearTimeout(timer);
    }
    if (phase === "descent") {
      const timer = window.setTimeout(() => { setCameraMode("first-person"); setPhase("explore"); }, 1150);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  const navigateToSite = useCallback((target: LunarSite) => {
    setPlaying(false);
    setSite(target);
    setActiveSite(target);
    // Changing the active site rebuilds the scene's first-person spawn at
    // the selected coordinates, so map and world nodes navigate identically.
    setCameraMode("first-person");
    setPhase("explore");
    setMapOpen(false);
  }, []);
  const selectDataPoint = useCallback((point: TerrainSample) => {
    const target: LunarSite = {
      id: `grid-${point.latitudeDeg}-${point.longitudeDeg}`,
      name: `Grid point · ${point.latitudeDeg}° / ${point.longitudeDeg}° E`,
      latitudeDeg: point.latitudeDeg,
      longitudeDeg: point.longitudeDeg,
      coordinateReference: "Planetocentric latitude, east-positive longitude",
      provenance: "illustrative",
    };
    navigateToSite(target);
  }, [navigateToSite]);
  const beginDescent = () => {
    setPlaying(false);
    setActiveSite(site);
    setCameraMode(reducedMotion ? "first-person" : "orbit");
    setPhase(reducedMotion ? "explore" : "transfer");
  };
  const dayMinute = timestamp.getUTCHours() * 60 + timestamp.getUTCMinutes();
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getUTCFullYear();
    const month = calendarMonth.getUTCMonth();
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      return day < 1 || day > daysInMonth ? null : day;
    });
  }, [calendarMonth]);
  const chosenDateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp);
  const chooseUtcDay = (day: number) => {
    setTimestamp((current) => new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), day, current.getUTCHours(), current.getUTCMinutes())));
    setDatePickerOpen(false);
  };
  const advanceDay = () => {
    setPlaying(false);
    setTimestamp((date) => new Date(date.getTime() + 24 * 60 * 60 * 1000));
  };
  useEffect(() => {
    if (!datePickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDatePickerOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [datePickerOpen]);

  return <main className="relative isolate h-dvh w-full overflow-hidden bg-void text-bone" aria-label="Lunaris360 lunar simulation">
    <div className="absolute inset-0 z-0">
      <LunarScene variant="preview" active detail={deviceTier} still={reducedMotion} freeplay={phase !== "choose"} cameraMode={cameraMode} lookSensitivity={lookSensitivity} landingActive={phase === "descent"} zoom={zoom} onTutorialAction={guided ? recordTutorialAction : undefined}
        selectedSite={activeSite} dataPoints={activeTerrain.corners} onSelectDataPoint={selectDataPoint}
        sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg}
        earthAzimuthDeg={celestial?.earth.azimuthDeg} earthElevationDeg={celestial?.earth.elevationDeg} />
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/50 via-transparent via-35% to-void/55" />
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full bg-gradient-to-r from-void/35 via-transparent to-void/25" />

    <header className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-2 sm:inset-x-5 sm:top-4">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 p-1.5 shadow-xl backdrop-blur-xl sm:gap-3 sm:p-2">
  {guided && onGuidedExit ? <button type="button" onClick={onGuidedExit} aria-label="Return to Guided Mission start page" className="grid size-9 shrink-0 place-items-center rounded-md bg-retro-purple/15 text-retro-purple transition hover:bg-retro-purple/25"><ArrowLeft size={17} /></button>
    : <Link href={guided ? "/mission" : "/freeplay"} aria-label={guided ? "Return to Guided Mission start page" : "Exit surface drive back to Open Exploration"} className="grid size-9 shrink-0 place-items-center rounded-md bg-retro-purple/15 text-retro-purple transition hover:bg-retro-purple/25"><ArrowLeft size={17} /></Link>}
  {guided && <Logo compact showWordmark={false} />}
  <div className="min-w-0 pr-2"><div className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Lunaris360 / {guided ? "Guided Mission" : "Open Exploration"}</div><div className="truncate text-xs font-medium text-bone">Lunar surface simulation</div></div>
        <span className="hidden h-8 w-px bg-line sm:block" />
        {phase === "explore" && <button type="button" onClick={() => setMapOpen((open) => { if (!open) { setMobileTelemetryOpen(false); setDatePickerOpen(false); } return !open; })} aria-expanded={mapOpen} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground hover:border-retro-purple/60 hover:text-bone sm:px-3"><Map size={14} className="text-retro-purple" /><span className="hidden sm:inline">{mapOpen ? "Hide map" : "Map & samples"}</span></button>}
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 px-3 py-2 shadow-xl backdrop-blur-xl sm:px-4">
        <span className="relative flex size-2">{!reducedMotion && <span className="absolute inline-flex size-full animate-ping rounded-full bg-retro-red opacity-50" />}<span className="relative inline-flex size-2 rounded-full bg-retro-red" /></span>
        <div className="min-w-0"><div className="type-data text-[0.56rem] uppercase tracking-[0.12em] text-retro-red">{phase === "transfer" ? "Transferring" : phase === "descent" ? "Descending" : loading ? "Syncing" : dataError ? "Data unavailable" : "Horizons ephemeris"}</div><div className="type-data truncate text-[0.62rem] text-bone sm:text-xs">{activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</div></div>
      </div>
    </header>

    {phase === "choose" && (pickHere
      ? <MoonLocationPicker selectedSite={site} onSelect={setSite} onContinue={beginDescent} sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg} />
      : <div className="absolute inset-0 z-30 grid place-items-center bg-void/60 p-4 backdrop-blur-[3px]">
        <div className="hud-panel w-full max-w-md p-5 text-center">
          <Globe2 className="mx-auto text-retro-purple" size={22} aria-hidden />
          <h1 className="type-heading mt-2 text-lg text-bone">Pick a site first</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The surface drive starts where you are in Freeplay. Choose a point on the Globe (or one of your saved sites), then open Surface drive again.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/freeplay" className="rounded bg-retro-purple px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void hover:bg-[#c2aaff]">Go to the globe</Link>
            <button type="button" onClick={() => setPickHere(true)} className="rounded border border-line px-4 py-2 text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-bone">Choose a site here</button>
          </div>
        </div>
      </div>)}

    {guided && phase === "explore" && <section aria-live="polite" aria-label="Guided Mission lesson" className="absolute right-3 top-20 z-30 max-h-[calc(100dvh-6rem)] w-[min(370px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl sm:right-5 sm:top-24 sm:p-5">
      {guidedComplete ? <>
        <div className="type-data text-[.58rem] uppercase tracking-[.17em] text-retro-red">Mission debrief · complete</div>
        <h2 className="type-heading mt-2 text-xl text-bone">You have the flight controls.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">You picked a site on the globe, followed the Sun and Earth through a mission, compared candidates and stood on the surface. Your selected site is {activeSite.name}. Positions came from stored JPL Horizons ephemerides; check each site&apos;s horizon source before comparing its numbers.</p>
        <Link href="/freeplay" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-retro-purple px-4 type-data text-[.62rem] font-semibold uppercase tracking-[.12em] text-void hover:bg-[#c2abff]">Explore the Moon <ArrowLeft className="rotate-180" size={14} /></Link>
      </> : <>
        <LessonCard lesson={SURFACE_LESSON} chapter={chapter} stage={guidedStage} complete={lessonComplete} onPrevious={guidedStage === "story" ? onBack : () => setGuidedStage(guidedStage === "try" ? "example" : "story")} onStageChange={setGuidedStage} onNext={() => setGuidedComplete(true)} nextLabel="Finish Guided Mission" exampleContent={<LessonExampleActivity lesson={SURFACE_LESSON} stops={tutorial?.tourStops ?? []} candidates={[]} />}>
          {guidedStage === "try" && <>
            <p className={lessonCheckClass}>Looked {tutorialActions.has("look") ? "✓" : "○"} · Moved {tutorialActions.has("move") ? "✓" : "○"} · Changed camera {tutorialActions.has("camera") ? "✓" : "○"}</p>
            <p className="mt-2 text-xs leading-relaxed text-retro-blue">Terrain source: {dataError ? "unavailable" : metrics?.horizonSource ?? "loading"}{horizonPeak ? ` · Highest ridge ${angle(horizonPeak.elevationDeg)} above the horizon` : horizonPeak === null ? " · No terrain mask; visibility is an upper-bound estimate" : ""}</p>
            <button type="button" onClick={() => recordTutorialAction("horizon")} className={lessonActionClass}>{tutorialActions.has("horizon") ? "Horizon checked ✓" : "I checked the horizon"}</button>
          </>}
        </LessonCard>
      </>}
    </section>}

    {(phase === "transfer" || phase === "descent") && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-void/15 px-5 backdrop-blur-[1px]">
      <div className="w-full max-w-sm rounded-xl border border-retro-purple/40 bg-void/85 p-5 text-center shadow-[0_0_80px_rgba(169,134,255,0.16)] backdrop-blur-xl sm:p-7">
        <div className="type-data text-[0.62rem] uppercase tracking-[0.18em] text-retro-purple">{guided ? "Guided Mission · arrival" : "Open Exploration · step 2 of 2"}</div>
        <h2 className="type-heading mt-3 text-xl text-bone">{phase === "transfer" ? "Transferring to lunar orbit" : "Descending to surface"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{activeSite.name} · {activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full bg-gradient-to-r from-retro-purple via-retro-blue to-retro-red ${phase === "transfer" ? "w-2/5" : "w-4/5"} transition-[width] duration-1000`} /></div>
      </div>
    </div>}
    {phase === "explore" && mapOpen && <div className="fixed inset-0 z-[45] grid place-items-center bg-void/65 px-3 py-8 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setMapOpen(false); }}>
      <div className="h-[min(86dvh,760px)] w-[min(820px,calc(100vw-1.5rem))]" onMouseDown={(event) => event.stopPropagation()}>
        <MoonLocationPicker mode="hud" selectedSite={site} onSelect={setSite} onNavigate={navigateToSite} onClose={() => setMapOpen(false)} onContinue={() => { setMapOpen(false); beginDescent(); }} sunAzimuthDeg={celestial?.sun.azimuthDeg} sunElevationDeg={celestial?.sun.elevationDeg} />
      </div>
    </div>}

    {phase === "explore" && !mapOpen && !datePickerOpen && <aside className="absolute right-4 top-[5.5rem] z-10 hidden max-h-[calc(100dvh-27rem)] w-[320px] space-y-3 overflow-y-auto overscroll-contain pr-1 xl:block">
      <section className="hud-panel p-4">
        <div className="flex items-center justify-between"><div><div className="type-data text-xs uppercase tracking-[0.14em] text-retro-blue">Telemetry</div><h2 className="type-heading mt-1 text-base text-bone">Local conditions</h2></div><Activity size={17} className="text-retro-blue" /></div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <Readout label="Sun elevation" value={celestial ? angle(celestial.sun.elevationDeg) : "—"} tone="red" />
          <Readout label="Sun azimuth" value={celestial ? `${celestial.sun.azimuthDeg.toFixed(1)}°` : "—"} tone="red" />
          <Readout label="Earth elevation" value={celestial ? angle(celestial.earth.elevationDeg) : "—"} tone="blue" />
          <Readout label="Earth azimuth" value={celestial ? `${celestial.earth.azimuthDeg.toFixed(1)}°` : "—"} tone="blue" />
          <Readout label={`Elevation · ${terrainLabel}`} value={`${Math.round(displayElevation).toLocaleString()} m`} />
          <Readout label={`Slope · ${terrainLabel}`} value={`${displaySlope.toFixed(1)}°`} />
        </div>
        <div className="mt-4 border-t border-line/80 pt-3 text-xs leading-relaxed text-muted-foreground">{dataError ? "Science provider unavailable" : `${metrics?.horizonSource ?? "Horizon pending"} · JPL Horizons ephemeris · rendered terrain is procedural`}</div>
      </section>
      <section className="hud-panel p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="type-data text-xs uppercase tracking-[0.14em] text-retro-purple">Mission window · 24 h</h2><span className="type-data rounded border border-retro-red/35 px-1.5 py-0.5 text-[0.62rem] uppercase text-retro-red">{metrics?.provenance === "scientific" ? "Computed" : "Unavailable"}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <Readout label="Sunlit duration" value={metrics ? `${metrics.sunlightHours} h` : "—"} tone="red" />
          <Readout label="Sunlit share" value={metrics ? `${metrics.sunlightPercent}%` : "—"} tone="red" />
          <Readout label="Earth visibility" value={metrics ? `${metrics.earthVisibilityPercent}%` : "—"} tone="blue" />
          <Readout label="Longest blackout" value={metrics ? `${metrics.longestBlackoutHours} h` : "—"} tone="blue" />
        </div>
      </section>
    </aside>}

    {phase === "explore" && <button type="button" onClick={() => setMobileTelemetryOpen((open) => { if (!open) { setMapOpen(false); setDatePickerOpen(false); } return !open; })} aria-expanded={mobileTelemetryOpen} className="absolute right-3 top-[4.9rem] z-20 grid size-10 place-items-center rounded-lg border border-line bg-void/75 text-retro-blue shadow-xl backdrop-blur-xl xl:hidden" aria-label="Toggle telemetry"><Activity size={17} /></button>}
    {phase === "explore" && mobileTelemetryOpen && <div className="fixed inset-0 z-[45] grid place-items-center overflow-y-auto bg-void/65 px-4 py-8 backdrop-blur-sm xl:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileTelemetryOpen(false); }}>
      <aside role="dialog" aria-label="Local lunar conditions and mission window" aria-modal="true" className="hud-panel my-auto w-[min(440px,calc(100vw-2rem))] space-y-4 p-5">
        <section>
          <div className="flex items-center justify-between"><div><div className="type-data text-xs uppercase tracking-[0.14em] text-retro-blue">Telemetry</div><h2 className="type-heading mt-1 text-base text-bone">Local conditions</h2></div><button type="button" aria-label="Close telemetry" onClick={() => setMobileTelemetryOpen(false)} className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={17} /></button></div>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3"><Readout label="Sun elevation" value={celestial ? angle(celestial.sun.elevationDeg) : "—"} tone="red" /><Readout label="Sun azimuth" value={celestial ? `${celestial.sun.azimuthDeg.toFixed(1)}°` : "—"} tone="red" /><Readout label="Earth elevation" value={celestial ? angle(celestial.earth.elevationDeg) : "—"} tone="blue" /><Readout label="Earth azimuth" value={celestial ? `${celestial.earth.azimuthDeg.toFixed(1)}°` : "—"} tone="blue" /><Readout label={`Elevation · ${terrainLabel}`} value={`${Math.round(displayElevation).toLocaleString()} m`} /><Readout label={`Slope · ${terrainLabel}`} value={`${displaySlope.toFixed(1)}°`} /></div>
        </section>
        <section className="border-t border-line/80 pt-4">
          <h2 className="type-data text-xs uppercase tracking-[0.14em] text-retro-purple">Mission window · 24 h</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3"><Readout label="Sunlit duration" value={metrics ? `${metrics.sunlightHours} h` : "—"} tone="red" /><Readout label="Sunlit share" value={metrics ? `${metrics.sunlightPercent}%` : "—"} tone="red" /><Readout label="Earth visibility" value={metrics ? `${metrics.earthVisibilityPercent}%` : "—"} tone="blue" /><Readout label="Longest blackout" value={metrics ? `${metrics.longestBlackoutHours} h` : "—"} tone="blue" /></div>
        </section>
      </aside>
    </div>}

    {phase === "explore" && <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] hidden -translate-x-1/2 -translate-y-1/2 sm:block">
      <div className="relative size-7"><span className="absolute left-1/2 top-0 h-2 -translate-x-1/2 border-l border-retro-purple/70" /><span className="absolute bottom-0 left-1/2 h-2 -translate-x-1/2 border-l border-retro-purple/70" /><span className="absolute left-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70" /><span className="absolute right-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70" /><span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-retro-red shadow-[0_0_12px_3px_rgba(255,99,125,0.5)]" /></div>
    </div>}
    {phase === "explore" && <div className="pointer-events-none absolute bottom-[6.9rem] right-5 z-[2] hidden items-center gap-2 rounded border border-line/70 bg-void/45 px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur sm:flex"><Crosshair size={13} className="text-retro-purple" />WASD / arrows to move · move cursor to look · click grid nodes</div>}

    {phase === "explore" && <section aria-label="Simulation controls" className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-retro-purple/25 bg-void/88 px-3 py-2.5 shadow-[0_20px_90px_rgba(4,2,18,0.65)] backdrop-blur-2xl sm:inset-x-auto sm:left-1/2 sm:w-[min(680px,calc(100vw-400px))] sm:min-w-[560px] sm:-translate-x-1/2 sm:px-4 sm:py-3 xl:left-[calc(50%-10rem)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
          {([["first-person", "First person"], ["orbit", "Orbit"], ["overhead", "Map"]] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => { setCameraMode(mode); recordTutorialAction("camera"); }} aria-pressed={cameraMode === mode} className={`rounded-md px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.08em] transition ${cameraMode === mode ? "bg-retro-purple/20 text-retro-purple" : "text-muted-foreground hover:text-bone"}`}>{label}</button>)}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.min(1.8, value + 0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomOut size={15} /></button>
          <button type="button" aria-label="Reset view" onClick={() => { setZoom(1); setCameraMode("first-person"); }} className="rounded p-1.5 text-bone hover:bg-white/10"><RotateCcw size={14} /></button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.max(0.5, value - 0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomIn size={15} /></button>
        </div>
        <div className="type-data flex items-center gap-2 text-[0.62rem] text-muted-foreground sm:ml-auto"><Clock3 size={14} className="text-retro-red" /><span>{localTime(timestamp)}</span></div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line/70 pt-2">
        <label className="flex min-w-44 flex-1 items-center gap-2 type-data text-[0.55rem] uppercase tracking-[0.1em] text-muted-foreground sm:max-w-64">
          <span className="shrink-0">Look sensitivity</span>
          <input aria-label="Look sensitivity" type="range" min={0.25} max={2.5} step={0.05} value={lookSensitivity} onChange={(event) => setLookSensitivity(Number(event.target.value))} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#a986ff]" />
          <span className="w-8 text-right text-retro-purple">{lookSensitivity.toFixed(2)}×</span>
        </label>
        <p className="type-data text-right text-[0.55rem] uppercase tracking-[0.1em] text-muted-foreground">WASD / arrows to move<br />Move cursor to look</p>
      </div>
      <div className="mt-2.5 flex items-center gap-2 sm:gap-3">
        <button type="button" disabled={reducedMotion} onClick={() => setPlaying((value) => !value)} className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-retro-red px-3 text-[0.63rem] font-semibold uppercase tracking-[0.1em] text-void transition hover:bg-[#ff91a2] disabled:cursor-not-allowed disabled:opacity-50" aria-label={playing ? "Pause simulation" : "Play simulation"} title={reducedMotion ? "Autoplay is paused by your reduced-motion setting" : undefined}>{playing ? <Pause size={14} /> : <Play size={14} />}<span className="hidden sm:inline">{playing ? "Pause" : "Run time"}</span></button>
        <label className="sr-only" htmlFor="playback-speed">Fast-forward speed</label><select id="playback-speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="h-9 rounded-lg border border-line bg-void px-2 text-[0.62rem] text-bone"><option value={1}>1 h/s</option><option value={6}>6 h/s</option><option value={24}>24 h/s</option></select>
        <button type="button" onClick={advanceDay} aria-label="Advance one day" title="Fast-forward one day to see the sunlight change" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-retro-red/40 px-2.5 text-[0.62rem] text-retro-red transition hover:bg-retro-red/10"><FastForward size={14} /><span className="hidden sm:inline">1 day</span></button>
        <input aria-label="Simulation time of day in UTC" type="range" min={0} max={1439} value={dayMinute} onChange={(event) => { setTimestamp((date) => { const next = new Date(date); next.setUTCHours(0, Number(event.target.value), 0, 0); return next; }); }} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#ff5364]" />
        <div className="relative">
          <button type="button" id="simulation-date-trigger" aria-haspopup="dialog" aria-expanded={datePickerOpen} onClick={() => { if (!datePickerOpen) { setMapOpen(false); setMobileTelemetryOpen(false); setCalendarMonth(new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), 1))); } setDatePickerOpen((open) => !open); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-void px-2.5 text-[0.58rem] text-bone transition hover:border-retro-purple/60 hover:bg-retro-purple/10"><CalendarDays size={14} className="text-retro-purple" /><span>{chosenDateLabel}</span></button>
          {datePickerOpen && createPortal(<div className="fixed inset-0 z-[60] grid place-items-center bg-void/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDatePickerOpen(false); }}><div role="dialog" data-no-flight-controls aria-label="Choose simulation date and UTC time" aria-modal="true" className="w-[min(380px,calc(100vw-2rem))] rounded-xl border border-retro-purple/40 bg-[#100e20]/[.98] p-4 shadow-[0_18px_70px_rgba(4,2,18,0.9)] backdrop-blur-2xl">
            <div className="flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ChevronLeft size={15} /></button><div className="flex items-center gap-2"><select aria-label="Calendar month" value={calendarMonth.getUTCMonth()} onChange={(event) => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), Number(event.target.value), 1)))} className="h-8 rounded border border-line bg-void px-2 type-data text-xs text-bone">{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, month, 1)))}</option>)}</select><select aria-label="Calendar year" value={calendarMonth.getUTCFullYear()} onChange={(event) => setCalendarMonth((month) => new Date(Date.UTC(Number(event.target.value), month.getUTCMonth(), 1)))} className="h-8 rounded border border-line bg-void px-2 type-data text-xs text-bone">{Array.from({ length: 142 }, (_, index) => 1959 + index).map((year) => <option key={year} value={year}>{year}</option>)}</select></div><button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ChevronRight size={15} /></button></div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className="type-data py-1 text-[0.55rem] text-muted-foreground">{day}</span>)}
              {calendarDays.map((day, index) => day === null ? <span key={`empty-${index}`} /> : <button key={day} type="button" aria-pressed={timestamp.getUTCFullYear() === calendarMonth.getUTCFullYear() && timestamp.getUTCMonth() === calendarMonth.getUTCMonth() && timestamp.getUTCDate() === day} onClick={() => chooseUtcDay(day)} className={`grid aspect-square place-items-center rounded-md type-data text-xs transition ${timestamp.getUTCFullYear() === calendarMonth.getUTCFullYear() && timestamp.getUTCMonth() === calendarMonth.getUTCMonth() && timestamp.getUTCDate() === day ? "bg-retro-purple text-void" : "text-bone hover:bg-retro-blue/15 hover:text-retro-blue"}`}>{day}</button>)}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line/80 pt-3"><label htmlFor="simulation-utc-hour" className="type-data text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground">UTC time</label><div className="flex items-center gap-1.5"><select id="simulation-utc-hour" aria-label="UTC hour" value={timestamp.getUTCHours()} onChange={(event) => { setTimestamp((date) => { const next = new Date(date); next.setUTCHours(Number(event.target.value)); return next; }); }} className="h-8 rounded border border-line bg-void px-2 type-data text-xs text-bone">{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}</option>)}</select><span className="text-muted-foreground">:</span><select aria-label="UTC minute" value={timestamp.getUTCMinutes()} onChange={(event) => { setTimestamp((date) => { const next = new Date(date); next.setUTCMinutes(Number(event.target.value)); return next; }); }} className="h-8 rounded border border-line bg-void px-2 type-data text-xs text-bone">{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={minute}>{String(minute).padStart(2, "0")}</option>)}</select><span className="type-data text-[0.55rem] text-retro-blue">Z</span></div></div>
            <button type="button" onClick={() => setDatePickerOpen(false)} className="mt-3 w-full rounded border border-retro-purple/45 bg-retro-purple/10 px-3 py-2 type-data text-[0.58rem] uppercase tracking-[0.12em] text-retro-purple hover:bg-retro-purple/20">Done</button>
          </div></div>, document.body)}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2 text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Globe2 size={12} className="text-retro-blue" />Procedural terrain · ephemeris from JPL Horizons</span><span className="hidden sm:inline">{loading ? "Updating environment" : dataError ? "DATA UNAVAILABLE" : "Computed"}</span></div>
    </section>}
  </main>;
}
