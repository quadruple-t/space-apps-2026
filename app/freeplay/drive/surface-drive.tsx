"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Crosshair, Globe2, Hammer, LocateFixed, Map, Pause, Play, RotateCcw, SkipBack, SkipForward, ZoomIn, ZoomOut, X } from "lucide-react";
import type { CameraMode } from "@/scenes/lunar/camera-rig";
import type { PlacementCheck, PlayerState } from "@/scenes/lunar/dem-scene";
import type { TerrainColorMode } from "@/scenes/lunar/dem-terrain";
import { SURFACE_OBJECTS, type SurfaceObjectType } from "@/scenes/lunar/surface-objects";
import { apiScienceProvider as scienceProvider } from "@/integrations/science/api-provider";
import type { CelestialState, LunarSite, MissionMetrics } from "@/integrations/science/types";
import { interpolateTerrain, MOON_REGIONS, terrainGridForSite, type TerrainSample } from "@/integrations/terrain/moon-samples";
import { MoonLocationPicker } from "./moon-location-picker";
import { SkyDial } from "./sky-dial";
import { TerrainBuildPanel, type PlacementStatus } from "./terrain-build-panel";
import { useDemTile } from "./use-dem-tile";
import { useLocalSky } from "./use-sky-clock";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { LessonCard, lessonActionClass, lessonCheckClass } from "@/app/mission/lesson-card";
import { SURFACE_LESSON } from "@/app/mission/tutorial-content";
import type { TutorialData } from "@/app/mission/use-tutorial-data";
import { lunarSiteFor, radiusFromDriveParams, siteFromDriveParams, timeFromDriveParams } from "@/lib/drive-link";
import { loadPlacements, MAX_PLACEMENTS, placementSiteKey, savePlacements, type Placement } from "@/lib/drive-placements";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { SOLAR_CONSTANT_W_M2 } from "@/lib/illumination";
import { MAIN_SERIES_END } from "@/lib/lunar-data";
import { discVisibleFraction, heightAtLocal, horizonElevationDeg, horizonProfile, skyAtLocal, slopeAtLocal } from "@/lib/terrain/dem";

const LunarScene = dynamic(() => import("@/scenes/lunar/lunar-scene"), { ssr: false });
const DemScene = dynamic(() => import("@/scenes/lunar/dem-scene"), { ssr: false });
const initialTime = new Date("2026-11-14T12:00:00.000Z");
const SERIES_END_MS = Date.parse(MAIN_SERIES_END);
const DEFAULT_RADIUS_KM = 5;
/** Simulated hours per real second. 72 h/s plays a full lunar day (~29.5 days) in about ten seconds. */
const SPEEDS = [{ hps: 1, label: "1 h/s" }, { hps: 6, label: "6 h/s" }, { hps: 24, label: "1 day/s" }, { hps: 72, label: "3 days/s" }] as const;
const EARTH_RADIUS_DEG = 0.95;
const SOLAR_PANEL_M2 = 18;
const SOLAR_EFFICIENCY = 0.3;
const angle = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}°`;
const localTime = (date: Date) => `${date.toISOString().slice(0, 10)} · ${date.toISOString().slice(11, 16)} UTC`;
const distanceLabel = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

function Readout({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "blue" }) {
  const color = tone === "red" ? "text-retro-red" : tone === "blue" ? "text-retro-blue" : "text-bone";
  return <div className="hud-readout"><div className="hud-label">{label}</div><div className={`type-data mt-1 text-sm ${color}`}>{value}</div></div>;
}

/** `guided` runs the Guided Mission's closing activity at the site and mission time chosen in Freeplay. */
export function SurfaceDrive({ guided = false, tutorial, startSite = MOON_REGIONS[0].site, startUtc, onBack }: { guided?: boolean; tutorial?: TutorialData; startSite?: LunarSite; startUtc?: string; onBack?: () => void }) {
  // Start at the site, radius and time chosen in Freeplay (URL first, so reloads and shared links work).
  const params = useSearchParams();
  const [start] = useState(() => {
    const fp = useFreeplay.getState();
    return {
      site: siteFromDriveParams(params) ?? (fp.site ? lunarSiteFor(fp.site) : null),
      time: timeFromDriveParams(params) ?? (fp.site ? new Date(currentTimeMs(fp)) : initialTime),
      radiusKm: radiusFromDriveParams(params) ?? fp.site?.radiusKm ?? DEFAULT_RADIUS_KM,
    };
  });
  const [pickHere, setPickHere] = useState(false);
  const [site, setSite] = useState<LunarSite>(start.site ?? MOON_REGIONS[0].site);
  const [activeSite, setActiveSite] = useState<LunarSite>(start.site ?? MOON_REGIONS[0].site);
  const [phase, setPhase] = useState<"choose" | "transfer" | "descent" | "explore">(start.site ? "transfer" : "choose");
  const [timestamp, setTimestamp] = useState(start.time);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(24);
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
  const [lookSensitivity, setLookSensitivity] = useState(1);
  // Measured terrain and the surface planner.
  const [radiusKm, setRadiusKm] = useState(start.radiusKm);
  const [exaggeration, setExaggeration] = useState(1);
  const [colorMode, setColorMode] = useState<TerrainColorMode>("regolith");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [buildType, setBuildType] = useState<SurfaceObjectType | null>(null);
  const [buildHeading, setBuildHeading] = useState(0);
  const [hoverCheck, setHoverCheck] = useState<PlacementCheck | null>(null);
  const [placementState, setPlacementState] = useState<{ key: string; list: Placement[] } | null>(null);
  const [player, setPlayer] = useState<PlayerState>({ eastM: 0, northM: 0, headingDeg: 0 });
  const [recenterKey, setRecenterKey] = useState(0);
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

  const environmentSite = useMemo(() => phase === "choose" ? site : activeSite, [phase, site, activeSite]);
  const dem = useDemTile(phase === "choose" ? null : activeSite.latitudeDeg, phase === "choose" ? null : activeSite.longitudeDeg, radiusKm, deviceTier === "high" ? 257 : 129);
  const tile = dem.tile;

  // Sun and Earth: the stored Horizons series decoded in the browser, else the science API.
  const localSky = useLocalSky(environmentSite.latitudeDeg, environmentSite.longitudeDeg, tile?.centerM ?? 0, timestamp.getTime());
  const sky = useMemo(() => localSky ? { sun: localSky.sun, earth: localSky.earth } : celestial ? { sun: celestial.sun, earth: celestial.earth } : null, [localSky, celestial]);
  const hasLocalSky = localSky !== null;

  const activeTerrain = useMemo(() => interpolateTerrain(terrainGridForSite(activeSite), activeSite.latitudeDeg, activeSite.longitudeDeg), [activeSite]);
  const scaffoldElevation = environmentSite.provenance === "scientific" && environmentSite.elevationMeters != null ? environmentSite.elevationMeters : activeTerrain.elevationMeters;
  const scaffoldSlope = environmentSite.provenance === "scientific" && environmentSite.slopeDeg != null ? environmentSite.slopeDeg : activeTerrain.slopeDeg;
  const scaffoldLabel = environmentSite.provenance === "scientific" ? "LOLA DEM" : "Scaffold";

  // Buggy position on the measured grid: elevation, slope and its own view of the sky.
  const buggy = useMemo(() => {
    if (!tile) return null;
    const { eastM, northM } = player;
    const toLocal = (b: { azimuthDeg: number; elevationDeg: number }) => skyAtLocal(tile.center.latDeg, eastM, northM, b.azimuthDeg, b.elevationDeg);
    const sun = sky ? toLocal(sky.sun) : null, earth = sky ? toLocal(sky.earth) : null;
    return {
      elevationM: heightAtLocal(tile, eastM, northM),
      slopeDeg: slopeAtLocal(tile, eastM, northM),
      distanceM: Math.hypot(eastM, northM),
      sun, earth,
      sunVisible: sun ? discVisibleFraction(sun.elevationDeg, Math.max(0, horizonElevationDeg(tile, eastM, northM, sun.azimuthDeg))) : null,
      earthVisible: earth ? discVisibleFraction(earth.elevationDeg, Math.max(0, horizonElevationDeg(tile, eastM, northM, earth.azimuthDeg)), EARTH_RADIUS_DEG) : null,
    };
  }, [tile, player, sky]);
  // The terrain horizon around the buggy changes only when it moves a meaningful distance.
  const profileEast = tile ? Math.round(player.eastM / (tile.spacingM / 2)) : 0, profileNorth = tile ? Math.round(player.northM / (tile.spacingM / 2)) : 0;
  const skyProfile = useMemo(() => tile ? horizonProfile(tile, profileEast * tile.spacingM / 2, profileNorth * tile.spacingM / 2, 4) : null, [tile, profileEast, profileNorth]);

  // Placements are stored per site centre, independent of the radius.
  const placementKey = placementSiteKey(activeSite.latitudeDeg, activeSite.longitudeDeg);
  if (placementState?.key !== placementKey && typeof window !== "undefined") setPlacementState({ key: placementKey, list: loadPlacements(placementKey) });
  const placements = useMemo(() => placementState?.key === placementKey ? placementState.list : [], [placementState, placementKey]);
  const updatePlacements = useCallback((change: (list: Placement[]) => Placement[]) => {
    setPlacementState((current) => {
      const list = change(current?.key === placementKey ? current.list : []);
      savePlacements(placementKey, list);
      return { key: placementKey, list };
    });
  }, [placementKey]);
  const placeObject = useCallback((eastM: number, northM: number) => {
    if (!buildType) return;
    updatePlacements((list) => list.length >= MAX_PLACEMENTS ? list : [...list, { id: `${buildType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, type: buildType, eastM: Math.round(eastM * 10) / 10, northM: Math.round(northM * 10) / 10, headingDeg: buildHeading }]);
  }, [buildType, buildHeading, updatePlacements]);
  const statusFor = useCallback((p: Placement): PlacementStatus | null => {
    if (!tile) return null;
    const toLocal = (b: { azimuthDeg: number; elevationDeg: number }) => skyAtLocal(tile.center.latDeg, p.eastM, p.northM, b.azimuthDeg, b.elevationDeg);
    const sun = sky ? toLocal(sky.sun) : null, earth = sky ? toLocal(sky.earth) : null;
    const observer = p.type === "solar" ? 6 : p.type === "comms" ? 8 : 3;
    const sunVisible = sun ? discVisibleFraction(sun.elevationDeg, Math.max(0, horizonElevationDeg(tile, p.eastM, p.northM, sun.azimuthDeg, observer))) : 0;
    const earthVisible = earth ? discVisibleFraction(earth.elevationDeg, Math.max(0, horizonElevationDeg(tile, p.eastM, p.northM, earth.azimuthDeg, observer)), EARTH_RADIUS_DEG) : 0;
    const flux = localSky ? SOLAR_CONSTANT_W_M2 / localSky.sunRangeAu ** 2 : SOLAR_CONSTANT_W_M2;
    return { sunVisible, earthVisible, slopeDeg: slopeAtLocal(tile, p.eastM, p.northM), powerKw: sun ? (flux * SOLAR_PANEL_M2 * SOLAR_EFFICIENCY * sunVisible) / 1000 : null };
  }, [tile, sky, localSky]);

  const utcDay = timestamp.toISOString().slice(0, 10);
  const updateCelestial = useCallback(async (selectedSite: LunarSite, date: Date) => {
    const request = ++celestialRequest.current;
    try {
      const result = await scienceProvider.getCelestialState(selectedSite, date.toISOString());
      if (request === celestialRequest.current) { setCelestial(result); setDataError(false); }
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

  // The API is only the fallback for the sky (outside the stored series or while it loads);
  // it is throttled during playback so fast time does not flood the server.
  useEffect(() => {
    if (hasLocalSky) return;
    const timer = window.setTimeout(() => { void updateCelestial(environmentSite, timestamp); }, playing ? 250 : 0);
    return () => { window.clearTimeout(timer); celestialRequest.current += 1; };
  }, [environmentSite, timestamp, updateCelestial, hasLocalSky, playing]);
  // 24-hour metrics refresh when playback pauses rather than for every simulated day.
  useEffect(() => {
    if (playing) return;
    void updateMetrics(environmentSite, utcDay);
  }, [environmentSite, utcDay, updateMetrics, playing]);
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

  // Fast playback: advance on animation frames so the Sun and Earth sweep smoothly.
  const timeRef = useRef(timestamp.getTime());
  useEffect(() => { timeRef.current = timestamp.getTime(); }, [timestamp]);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0, last = performance.now(), pending = 0;
    const tick = (now: number) => {
      pending += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pending >= 1 / 30) {
        const next = timeRef.current + pending * speed * 3_600_000;
        pending = 0;
        if (next > SERIES_END_MS && timeRef.current <= SERIES_END_MS) { setPlaying(false); return; }
        timeRef.current = next;
        setTimestamp(new Date(next));
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, speed, reducedMotion]);
  const stepTime = (hours: number) => setTimestamp((t) => new Date(t.getTime() + hours * 3_600_000));

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

  // Build-mode keys: Q / E rotate the preview, Escape stops placing.
  useEffect(() => {
    if (!buildType) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === "Escape") setBuildType(null);
      else if (event.key.toLowerCase() === "q") setBuildHeading((h) => (h + 345) % 360);
      else if (event.key.toLowerCase() === "e") setBuildHeading((h) => (h + 15) % 360);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buildType]);

  const navigateToSite = useCallback((target: LunarSite) => {
    setPlaying(false);
    setSite(target);
    setActiveSite(target);
    setBuildType(null);
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
  useEffect(() => {
    if (!datePickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDatePickerOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [datePickerOpen]);

  const measured = phase !== "choose" && tile !== null;
  const elevationReadout = measured && buggy ? { label: "Elevation · GLD100", value: `${Math.round(buggy.elevationM).toLocaleString()} m` } : { label: `Elevation · ${scaffoldLabel}`, value: `${Math.round(scaffoldElevation).toLocaleString()} m` };
  const slopeReadout = measured && buggy ? { label: `Slope · ~${Math.round(tile.spacingM)} m baseline`, value: `${buggy.slopeDeg.toFixed(1)}°` } : { label: `Slope · ${scaffoldLabel}`, value: `${scaffoldSlope.toFixed(1)}°` };
  const sunStatus = buggy?.sunVisible == null ? null : buggy.sunVisible > 0.99 ? "In view" : buggy.sunVisible > 0 ? "Partly hidden" : buggy.sun && buggy.sun.elevationDeg < 0 ? "Below horizon" : "Behind terrain";
  const terrainSourceText = measured ? `Terrain: LROC GLD100 heights (Lunaserv) · ${tile.radiusKm} km radius` : dem.loading ? "Loading measured terrain…" : "Procedural terrain (illustrative)";
  const skySourceText = hasLocalSky ? "Sky: JPL Horizons (stored)" : "Sky: JPL Horizons via API";
  const togglePlanner = () => setPlannerOpen((open) => { if (open) setBuildType(null); else { setMapOpen(false); setMobileTelemetryOpen(false); setDatePickerOpen(false); } return !open; });

  return <main className="relative isolate h-dvh w-full overflow-hidden bg-void text-bone" aria-label="Lunaris360 lunar simulation">
    <div className="absolute inset-0 z-0">
      {measured
        ? <DemScene grid={tile} radiusM={tile.radiusKm * 1000} exaggeration={exaggeration} colorMode={colorMode} detail={deviceTier} still={reducedMotion}
            cameraMode={cameraMode} zoom={zoom} lookSensitivity={lookSensitivity}
            sunAzimuthDeg={sky?.sun.azimuthDeg ?? 120} sunElevationDeg={sky?.sun.elevationDeg ?? 8} earthAzimuthDeg={sky?.earth.azimuthDeg ?? 200} earthElevationDeg={sky?.earth.elevationDeg ?? 20}
            placements={placements} buildType={buildType} buildHeadingDeg={buildHeading} onPlace={placeObject} onHoverCheck={setHoverCheck}
            onPlayer={setPlayer} onTutorialAction={guided ? recordTutorialAction : undefined} recenterKey={recenterKey} />
        : <LunarScene variant="preview" active detail={deviceTier} still={reducedMotion} freeplay={phase !== "choose"} cameraMode={cameraMode} lookSensitivity={lookSensitivity} landingActive={phase === "descent"} zoom={zoom} onTutorialAction={guided ? recordTutorialAction : undefined}
            selectedSite={activeSite} dataPoints={activeTerrain.corners} onSelectDataPoint={selectDataPoint}
            sunAzimuthDeg={sky?.sun.azimuthDeg} sunElevationDeg={sky?.sun.elevationDeg}
            earthAzimuthDeg={sky?.earth.azimuthDeg} earthElevationDeg={sky?.earth.elevationDeg} />}
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/50 via-transparent via-35% to-void/55" />
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full bg-gradient-to-r from-void/35 via-transparent to-void/25" />

    <header className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-2 sm:inset-x-5 sm:top-4">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 p-1.5 shadow-xl backdrop-blur-xl sm:gap-3 sm:p-2">
        <Link href={guided ? "/" : "/freeplay"} aria-label={guided ? "Exit Guided Mission to Lunaris360 home" : "Exit surface drive back to Freeplay"} className="grid size-9 shrink-0 place-items-center rounded-md bg-retro-purple/15 text-retro-purple transition hover:bg-retro-purple/25"><ArrowLeft size={17} /></Link>
        <div className="min-w-0 pr-2"><div className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Lunaris360 / {guided ? "Guided Mission" : "Freeplay"}</div><div className="truncate text-xs font-medium text-bone">{phase === "explore" ? activeSite.name : "Lunar surface simulation"}</div></div>
        <span className="hidden h-8 w-px bg-line sm:block" />
        {phase === "explore" && <button type="button" onClick={() => setMapOpen((open) => { if (!open) { setMobileTelemetryOpen(false); setDatePickerOpen(false); setPlannerOpen(false); setBuildType(null); } return !open; })} aria-expanded={mapOpen} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground hover:border-retro-purple/60 hover:text-bone sm:px-3"><Map size={14} className="text-retro-purple" /><span className="hidden sm:inline">{mapOpen ? "Hide map" : "Map & samples"}</span></button>}
        {phase === "explore" && <button type="button" onClick={togglePlanner} aria-expanded={plannerOpen} className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-2 text-[0.65rem] uppercase tracking-[0.1em] sm:px-3 ${plannerOpen ? "border-retro-red/60 text-bone" : "border-line text-muted-foreground hover:border-retro-purple/60 hover:text-bone"}`}><Hammer size={14} className="text-retro-red" /><span className="hidden sm:inline">Terrain &amp; build</span></button>}
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line/80 bg-void/75 px-3 py-2 shadow-xl backdrop-blur-xl sm:px-4">
        <span className="relative flex size-2">{!reducedMotion && <span className="absolute inline-flex size-full animate-ping rounded-full bg-retro-red opacity-50" />}<span className="relative inline-flex size-2 rounded-full bg-retro-red" /></span>
        <div className="min-w-0"><div className="type-data text-[0.56rem] uppercase tracking-[0.12em] text-retro-red">{phase === "transfer" ? "Transferring" : phase === "descent" ? "Descending" : dem.loading ? "Loading terrain" : loading && !hasLocalSky ? "Syncing" : dataError && !hasLocalSky ? "Data unavailable" : measured ? `Measured terrain · r ${tile.radiusKm} km` : "Horizons ephemeris"}</div><div className="type-data truncate text-[0.62rem] text-bone sm:text-xs">{activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</div></div>
      </div>
    </header>

    {phase === "choose" && (pickHere
      ? <MoonLocationPicker selectedSite={site} onSelect={setSite} onContinue={beginDescent} sunAzimuthDeg={sky?.sun.azimuthDeg} sunElevationDeg={sky?.sun.elevationDeg} />
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

    {guided && phase === "explore" && !plannerOpen && <section aria-live="polite" aria-label="Guided mission lesson" className="absolute left-3 top-[5rem] z-30 max-h-[calc(100dvh-16rem)] w-[min(390px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl sm:left-5 sm:top-[5.5rem] sm:p-5">
      {guidedComplete ? <>
        <div className="type-data text-[.58rem] uppercase tracking-[.17em] text-retro-red">Mission debrief · complete</div>
        <h2 className="type-heading mt-2 text-xl text-bone">You have the flight controls.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">You picked a site on the globe, followed the Sun and Earth through a mission, compared candidates and stood on the surface. Your selected site is {activeSite.name}. Positions came from stored JPL Horizons ephemerides; check each site&apos;s horizon source before comparing its numbers.</p>
        <Link href="/freeplay" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-retro-purple px-4 type-data text-[.62rem] font-semibold uppercase tracking-[.12em] text-void hover:bg-[#c2abff]">Enter Freeplay <ArrowLeft className="rotate-180" size={14} /></Link>
      </> : <>
        <LessonCard lesson={SURFACE_LESSON} chapter={chapter} complete={lessonComplete} onPrevious={onBack} onNext={() => setGuidedComplete(true)} nextLabel="Complete mission">
          <p className={lessonCheckClass}>LOOK {tutorialActions.has("look") ? "✓" : "○"} · MOVE {tutorialActions.has("move") ? "✓" : "○"} · CAMERA {tutorialActions.has("camera") ? "✓" : "○"}{sky ? ` · SUN EL ${angle(sky.sun.elevationDeg)}` : ""}</p>
          <p className="mt-2 type-data text-[.54rem] leading-relaxed text-retro-blue">HORIZON · {dataError ? "DATA UNAVAILABLE" : metrics?.horizonSource ?? "LOADING"}{horizonPeak ? ` · HIGHEST OBSTRUCTION ${angle(horizonPeak.elevationDeg)} TOWARD AZ ${horizonPeak.azimuthDeg.toFixed(0)}°` : horizonPeak === null ? " · NO TERRAIN MASK, VISIBILITY SHARES ARE UPPER BOUNDS" : ""}</p>
          <button type="button" onClick={() => recordTutorialAction("horizon")} className={lessonActionClass}>{tutorialActions.has("horizon") ? "Horizon inspected ✓" : "I inspected the terrain horizon"}</button>
        </LessonCard>
      </>}
    </section>}

    {(phase === "transfer" || phase === "descent") && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-void/15 px-5 backdrop-blur-[1px]">
      <div className="w-full max-w-sm rounded-xl border border-retro-purple/40 bg-void/85 p-5 text-center shadow-[0_0_80px_rgba(169,134,255,0.16)] backdrop-blur-xl sm:p-7">
        <div className="type-data text-[0.62rem] uppercase tracking-[0.18em] text-retro-purple">{guided ? "Guided mission · arrival" : "Freeplay setup · step 2 of 2"}</div>
        <h2 className="type-heading mt-3 text-xl text-bone">{phase === "transfer" ? "Transferring to lunar orbit" : "Descending to surface"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{activeSite.name} · {activeSite.latitudeDeg.toFixed(2)}° / {activeSite.longitudeDeg.toFixed(2)}° E</p>
        <p className="mt-1 type-data text-[0.58rem] uppercase tracking-[0.12em] text-retro-blue">{dem.loading ? `Loading ${radiusKm} km of measured terrain…` : tile ? "Measured terrain ready" : dem.error ? "Elevation unavailable · procedural terrain" : ""}</p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full bg-gradient-to-r from-retro-purple via-retro-blue to-retro-red ${phase === "transfer" ? "w-2/5" : "w-4/5"} transition-[width] duration-1000`} /></div>
      </div>
    </div>}

    {phase === "explore" && dem.loading && <div role="status" className="pointer-events-none absolute left-1/2 top-[5.4rem] z-20 -translate-x-1/2 rounded-full border border-retro-blue/40 bg-void/85 px-3 py-1.5 type-data text-[0.58rem] uppercase tracking-[0.12em] text-retro-blue backdrop-blur">Loading {radiusKm} km of measured terrain…</div>}
    {phase === "explore" && dem.error && !plannerOpen && <div role="status" className="absolute left-1/2 top-[5.4rem] z-20 max-w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-retro-red/40 bg-void/90 px-3 py-2 text-center text-[0.62rem] text-muted-foreground backdrop-blur">
      <span className="text-retro-red">Measured elevation unavailable</span> ({dem.error}). This view is procedural, illustrative terrain. Try a smaller radius or reload later.
    </div>}

    {phase === "explore" && plannerOpen && <div className="absolute bottom-[12.5rem] left-3 top-[5rem] z-30 w-[min(340px,calc(100vw-1.5rem))] sm:left-5 sm:top-[5.5rem]">
      <TerrainBuildPanel radiusKm={radiusKm} onRadius={(km) => { setRadiusKm(km); setBuildType(null); }} exaggeration={exaggeration} onExaggeration={setExaggeration} colorMode={colorMode} onColorMode={setColorMode}
        tile={tile} demLoading={dem.loading} demError={dem.error}
        buildType={buildType} onBuildType={(type) => { setBuildType(type); setHoverCheck(null); if (type && cameraMode === "first-person") setCameraMode("overhead"); }}
        heading={buildHeading} onHeading={(deg) => setBuildHeading(((deg % 360) + 360) % 360)} hoverCheck={hoverCheck}
        placements={placements} statusFor={statusFor}
        onDelete={(id) => updatePlacements((list) => list.filter((p) => p.id !== id))} onClear={() => updatePlacements(() => [])}
        onClose={() => { setPlannerOpen(false); setBuildType(null); }} />
    </div>}

    {phase === "explore" && mapOpen && <div className="fixed inset-0 z-[45] grid place-items-center bg-void/65 px-3 py-8 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setMapOpen(false); }}>
      <div className="h-[min(86dvh,760px)] w-[min(820px,calc(100vw-1.5rem))]" onMouseDown={(event) => event.stopPropagation()}>
        <MoonLocationPicker mode="hud" selectedSite={site} onSelect={setSite} onNavigate={navigateToSite} onClose={() => setMapOpen(false)} onContinue={() => { setMapOpen(false); beginDescent(); }} sunAzimuthDeg={sky?.sun.azimuthDeg} sunElevationDeg={sky?.sun.elevationDeg} />
      </div>
    </div>}

    {phase === "explore" && !mapOpen && !datePickerOpen && <aside className="absolute right-4 top-[5.5rem] z-10 hidden w-[276px] space-y-2.5 xl:block">
      <section className="hud-panel p-3.5">
        <div className="flex items-center justify-between"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-blue">Telemetry</div><h2 className="type-heading mt-1 text-sm text-bone">{measured ? "At the buggy" : "Local conditions"}</h2></div><Activity size={15} className="text-retro-blue" /></div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Readout label="Sun elevation" value={buggy?.sun ? angle(buggy.sun.elevationDeg) : sky ? angle(sky.sun.elevationDeg) : "—"} tone="red" />
          <Readout label="Sun azimuth" value={buggy?.sun ? `${buggy.sun.azimuthDeg.toFixed(1)}°` : sky ? `${sky.sun.azimuthDeg.toFixed(1)}°` : "—"} tone="red" />
          <Readout label="Earth elevation" value={buggy?.earth ? angle(buggy.earth.elevationDeg) : sky ? angle(sky.earth.elevationDeg) : "—"} tone="blue" />
          <Readout label="Earth azimuth" value={buggy?.earth ? `${buggy.earth.azimuthDeg.toFixed(1)}°` : sky ? `${sky.earth.azimuthDeg.toFixed(1)}°` : "—"} tone="blue" />
          <Readout label={elevationReadout.label} value={elevationReadout.value} />
          <Readout label={slopeReadout.label} value={slopeReadout.value} />
          {measured && buggy && <>
            <Readout label="From site centre" value={distanceLabel(buggy.distanceM)} />
            <Readout label="Sun · local terrain" value={sunStatus ?? "—"} tone="red" />
          </>}
        </div>
        <div className="mt-3 border-t border-line/80 pt-2 text-[0.58rem] leading-relaxed text-muted-foreground">{dataError && !hasLocalSky ? "Science provider unavailable" : `${skySourceText} · ${terrainSourceText}`}{measured ? ". Local sun status uses only terrain inside the loaded radius." : ""}</div>
      </section>
      <section className="hud-panel p-3.5">
        <div className="flex items-center justify-between"><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-purple">Mission window · 24 h</div><span className="type-data rounded border border-retro-red/35 px-1.5 py-0.5 text-[0.5rem] uppercase text-retro-red">{playing ? "Paused while playing" : metrics?.provenance === "scientific" ? "Computed" : "Unavailable"}</span></div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          <Readout label="Sunlit duration" value={metrics ? `${metrics.sunlightHours} h` : "—"} tone="red" />
          <Readout label="Sunlit share" value={metrics ? `${metrics.sunlightPercent}%` : "—"} tone="red" />
          <Readout label="Earth visibility" value={metrics ? `${metrics.earthVisibilityPercent}%` : "—"} tone="blue" />
          <Readout label="Longest blackout" value={metrics ? `${metrics.longestBlackoutHours} h` : "—"} tone="blue" />
        </div>
        <p className="mt-2 text-[0.54rem] text-muted-foreground">{metrics?.horizonSource ?? "Horizon pending"} (site centre, science API).</p>
      </section>
    </aside>}

    {phase === "explore" && <button type="button" onClick={() => setMobileTelemetryOpen((open) => { if (!open) { setMapOpen(false); setDatePickerOpen(false); } return !open; })} aria-expanded={mobileTelemetryOpen} className="absolute right-3 top-[4.9rem] z-20 grid size-10 place-items-center rounded-lg border border-line bg-void/75 text-retro-blue shadow-xl backdrop-blur-xl xl:hidden" aria-label="Toggle telemetry"><Activity size={17} /></button>}
    {phase === "explore" && mobileTelemetryOpen && <div className="fixed inset-0 z-[45] grid place-items-center bg-void/65 px-4 py-8 backdrop-blur-sm xl:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileTelemetryOpen(false); }}>
      <aside role="dialog" aria-label="Local lunar conditions" aria-modal="true" className="hud-panel w-[min(340px,calc(100vw-2rem))] space-y-3 p-4">
        <div className="flex items-center justify-between"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-blue">Telemetry</div><h2 className="type-heading mt-1 text-sm text-bone">{measured ? "At the buggy" : "Local conditions"}</h2></div><button type="button" aria-label="Close telemetry" onClick={() => setMobileTelemetryOpen(false)} className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={15} /></button></div>
        <div className="grid grid-cols-2 gap-1.5">
          <Readout label="Sun elevation" value={buggy?.sun ? angle(buggy.sun.elevationDeg) : sky ? angle(sky.sun.elevationDeg) : "—"} tone="red" />
          <Readout label="Sun azimuth" value={buggy?.sun ? `${buggy.sun.azimuthDeg.toFixed(1)}°` : sky ? `${sky.sun.azimuthDeg.toFixed(1)}°` : "—"} tone="red" />
          <Readout label="Earth elevation" value={buggy?.earth ? angle(buggy.earth.elevationDeg) : sky ? angle(sky.earth.elevationDeg) : "—"} tone="blue" />
          <Readout label={elevationReadout.label} value={elevationReadout.value} />
          {measured && buggy && <><Readout label={slopeReadout.label} value={slopeReadout.value} /><Readout label="Sun · local terrain" value={sunStatus ?? "—"} tone="red" /></>}
        </div>
        <p className="text-[0.56rem] leading-relaxed text-muted-foreground">{skySourceText} · {terrainSourceText}</p>
      </aside>
    </div>}

    {phase === "explore" && !buildType && <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] hidden -translate-x-1/2 -translate-y-1/2 sm:block">
      <div className="relative size-7"><span className="absolute left-1/2 top-0 h-2 -translate-x-1/2 border-l border-retro-purple/70" /><span className="absolute bottom-0 left-1/2 h-2 -translate-x-1/2 border-l border-retro-purple/70" /><span className="absolute left-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70" /><span className="absolute right-0 top-1/2 w-2 -translate-y-1/2 border-t border-retro-purple/70" /><span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-retro-red shadow-[0_0_12px_3px_rgba(255,99,125,0.5)]" /></div>
    </div>}
    {phase === "explore" && <div className="pointer-events-none absolute bottom-[12.6rem] right-5 z-[2] hidden items-center gap-2 rounded border border-line/70 bg-void/45 px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur sm:flex"><Crosshair size={13} className="text-retro-purple" />{measured ? buildType ? `Placing ${SURFACE_OBJECTS[buildType].short} · click ground · Q / E rotate · Esc done` : "WASD to drive · Shift boosts · mouse to look · double-click the map to jump" : "WASD / arrows to move · move cursor to look · click grid nodes"}</div>}

    {phase === "explore" && <section aria-label="Simulation controls" className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-retro-purple/25 bg-void/88 px-3 py-2.5 shadow-[0_20px_90px_rgba(4,2,18,0.65)] backdrop-blur-2xl sm:inset-x-auto sm:left-1/2 sm:w-[min(780px,calc(100vw-2.5rem))] sm:-translate-x-1/2 sm:px-4 sm:py-3">
      <div className="flex gap-3">
        <div className="hidden w-[104px] shrink-0 flex-col items-center sm:flex">
          <div className="size-[104px]"><SkyDial horizonDeg={skyProfile} stepDeg={4} sun={buggy?.sun ?? sky?.sun ?? null} earth={buggy?.earth ?? sky?.earth ?? null} sunVisible={buggy?.sunVisible ?? null} earthVisible={buggy?.earthVisible ?? null} /></div>
          <span className="type-data mt-0.5 text-[0.5rem] uppercase tracking-[0.1em] text-muted-foreground">Sky from buggy</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
              {([["first-person", measured ? "Drive" : "First person"], ["orbit", "Orbit"], ["overhead", "Map"]] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => { setCameraMode(mode); recordTutorialAction("camera"); }} aria-pressed={cameraMode === mode} className={`rounded-md px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.08em] transition ${cameraMode === mode ? "bg-retro-purple/20 text-retro-purple" : "text-muted-foreground hover:text-bone"}`}>{label}</button>)}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-void/60 p-1">
              <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.min(1.8, value + 0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomOut size={15} /></button>
              <button type="button" aria-label="Reset view" onClick={() => { setZoom(1); setCameraMode("first-person"); }} className="rounded p-1.5 text-bone hover:bg-white/10"><RotateCcw size={14} /></button>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.max(0.5, value - 0.12))} className="rounded p-1.5 text-bone hover:bg-white/10"><ZoomIn size={15} /></button>
              {measured && <button type="button" aria-label="Return the buggy to the site centre" title="Return to site centre" onClick={() => setRecenterKey((k) => k + 1)} className="rounded p-1.5 text-bone hover:bg-white/10"><LocateFixed size={14} /></button>}
            </div>
            <div className="type-data flex items-center gap-2 text-[0.62rem] text-muted-foreground sm:ml-auto"><Clock3 size={14} className="text-retro-red" /><span>{localTime(timestamp)}</span></div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 sm:gap-3">
            <button type="button" disabled={reducedMotion} onClick={() => setPlaying((value) => !value)} className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-retro-red px-3 text-[0.63rem] font-semibold uppercase tracking-[0.1em] text-void transition hover:bg-[#ff91a2] disabled:cursor-not-allowed disabled:opacity-50" aria-label={playing ? "Pause Sun and Earth motion" : "Play Sun and Earth motion"} title={reducedMotion ? "Autoplay is paused by your reduced-motion setting; use the step buttons" : undefined}>{playing ? <Pause size={14} /> : <Play size={14} />}<span className="hidden sm:inline">{playing ? "Pause" : "Play sky"}</span></button>
            <div role="radiogroup" aria-label="Playback speed" className="flex shrink-0 items-center rounded-lg border border-line/80 bg-void/60 p-0.5">
              {SPEEDS.map(({ hps, label }) => <button key={hps} type="button" role="radio" aria-checked={speed === hps} onClick={() => setSpeed(hps)} className={`rounded-md px-1.5 py-1 type-data text-[0.56rem] transition sm:px-2 ${speed === hps ? "bg-retro-red/20 text-retro-red" : "text-muted-foreground hover:text-bone"}`}>{label}</button>)}
            </div>
            <button type="button" aria-label="Back 6 hours" onClick={() => stepTime(-6)} className="hidden rounded p-1.5 text-bone hover:bg-white/10 sm:block"><SkipBack size={14} /></button>
            <input aria-label="Simulation time of day in UTC" type="range" min={0} max={1439} value={dayMinute} onChange={(event) => { setTimestamp((date) => { const next = new Date(date); next.setUTCHours(0, Number(event.target.value), 0, 0); return next; }); }} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#ff5364]" />
            <button type="button" aria-label="Forward 6 hours" onClick={() => stepTime(6)} className="hidden rounded p-1.5 text-bone hover:bg-white/10 sm:block"><SkipForward size={14} /></button>
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
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line/70 pt-2">
            <label className="flex min-w-40 flex-1 items-center gap-2 type-data text-[0.55rem] uppercase tracking-[0.1em] text-muted-foreground sm:max-w-60">
              <span className="shrink-0">Look</span>
              <input aria-label="Look sensitivity" type="range" min={0.25} max={2.5} step={0.05} value={lookSensitivity} onChange={(event) => setLookSensitivity(Number(event.target.value))} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#a986ff]" />
              <span className="w-8 text-right text-retro-purple">{lookSensitivity.toFixed(2)}×</span>
            </label>
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate type-data text-[0.52rem] uppercase tracking-[0.1em] text-muted-foreground"><Globe2 size={12} className="shrink-0 text-retro-blue" /><span className="truncate">{terrainSourceText} · {skySourceText}</span></span>
          </div>
        </div>
      </div>
    </section>}
  </main>;
}
