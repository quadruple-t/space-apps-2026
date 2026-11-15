"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Box, Eye, Hammer, LineChart, Mountain, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { useFreeplay } from "@/lib/freeplay-store";
import type { DemTile } from "@/integrations/terrain/dem-client";
import type { Placement } from "@/lib/drive-placements";
import { DEM_MAX_RADIUS_KM, DEM_MIN_RADIUS_KM } from "@/lib/terrain/dem";
import type { TerrainColorMode } from "@/scenes/lunar/dem-terrain";
import type { PlacementCheck } from "@/scenes/lunar/dem-scene";
import { SURFACE_OBJECT_TYPES, SURFACE_OBJECTS, type SurfaceObjectType } from "@/scenes/lunar/surface-objects";

/** `daily` covers the simulation's UTC day, hourly, using only terrain inside the loaded walls. */
export type PlacementStatus = {
  sunVisible: number; earthVisible: number; slopeDeg: number; powerKw: number | null;
  daily: { sunHours: number | null; earthHours: number; kwh: number } | null;
};

const COLOR_MODES: Array<[TerrainColorMode, string]> = [["regolith", "Regolith"], ["elevation", "Elevation"], ["slope", "Slope"]];
const EXAGGERATIONS = [1, 2, 4];
const chip = (active: boolean) => `rounded px-2 py-1 type-data text-[.56rem] uppercase tracking-[.08em] transition ${active ? "bg-retro-purple/20 text-retro-purple" : "text-muted-foreground hover:text-bone"}`;
const km = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;

export function TerrainBuildPanel({ radiusKm, onRadius, exaggeration, onExaggeration, colorMode, onColorMode, tile, demLoading, demError,
  buildType, onBuildType, heading, onHeading, hoverCheck, placements, statusFor, onView, selectedId, onSelect, setupDetails, graphsAvailable, onDelete, onClear, onClose }: {
  radiusKm: number; onRadius: (km: number) => void;
  exaggeration: number; onExaggeration: (value: number) => void;
  colorMode: TerrainColorMode; onColorMode: (mode: TerrainColorMode) => void;
  tile: DemTile | null; demLoading: boolean; demError: string | null;
  buildType: SurfaceObjectType | null; onBuildType: (type: SurfaceObjectType | null) => void;
  heading: number; onHeading: (deg: number) => void; hoverCheck: PlacementCheck | null;
  placements: Placement[]; statusFor: (placement: Placement) => PlacementStatus | null;
  /** Go and look at a placed object (first person stands in front of it; bird's eye centres on it). */
  onView: (placement: Placement) => void;
  /** The object clicked in the scene or in this list, and how to select one. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The Freeplay graphs are following this same site, so the link can open them. */
  graphsAvailable: boolean;
  setupDetails?: ReactNode;
  onDelete: (id: string) => void; onClear: () => void; onClose: () => void;
}) {
  const solarKwh = placements.filter((p) => p.type === "solar").reduce((sum, p) => sum + (statusFor(p)?.daily?.kwh ?? 0), 0);
  const [radiusText, setRadiusText] = useState(String(radiusKm));
  const [syncedRadius, setSyncedRadius] = useState(radiusKm);
  if (syncedRadius !== radiusKm) { setSyncedRadius(radiusKm); setRadiusText(String(radiusKm)); }
  const commitRadius = () => {
    const value = Number(radiusText);
    if (Number.isFinite(value) && value >= DEM_MIN_RADIUS_KM && value <= DEM_MAX_RADIUS_KM) onRadius(Number(value.toPrecision(3)));
    else setRadiusText(String(radiusKm));
  };

  return <section aria-label="Terrain and build tools" className="hud-panel flex max-h-full flex-col overflow-hidden">
    <header className="flex items-center justify-between gap-2 border-b border-line/80 px-3.5 py-2.5">
      <div><div className="type-data text-[.58rem] uppercase tracking-[.14em] text-retro-purple">Surface planner</div><h2 className="type-heading mt-0.5 text-sm text-bone">Terrain &amp; build</h2></div>
      <button type="button" onClick={onClose} aria-label="Close terrain and build panel" className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={15} /></button>
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
      <div>
        <div className="flex items-center gap-1.5 type-data text-[.58rem] uppercase tracking-[.12em] text-retro-blue"><Mountain size={13} />Measured terrain</div>
        <label className="mt-2 flex items-center justify-between gap-2 text-[.62rem] text-muted-foreground">Area radius
          <span className="flex items-center gap-1.5">
            <input inputMode="decimal" value={radiusText} aria-label="Area radius in kilometres" onChange={(e) => setRadiusText(e.target.value)} onBlur={commitRadius}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-16 rounded border border-line bg-void px-1.5 py-1 text-right type-data text-xs text-bone focus:border-retro-purple focus:outline-none" />
            <span className="type-data text-[.6rem]">km</span>
          </span>
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1">{[0.5, 2, 5, 10, 25, 100].map((r) => <button key={r} type="button" onClick={() => onRadius(r)} aria-pressed={radiusKm === r} className={chip(radiusKm === r)}>{r} km</button>)}</div>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[.62rem] text-muted-foreground">Relief
          <div className="flex rounded border border-line/80 p-0.5">{EXAGGERATIONS.map((x) => <button key={x} type="button" onClick={() => onExaggeration(x)} aria-pressed={exaggeration === x} className={chip(exaggeration === x)}>{x === 1 ? "True" : `${x}×`}</button>)}</div>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[.62rem] text-muted-foreground">Colour
          <div className="flex rounded border border-line/80 p-0.5">{COLOR_MODES.map(([mode, label]) => <button key={mode} type="button" onClick={() => onColorMode(mode)} aria-pressed={colorMode === mode} className={chip(colorMode === mode)}>{label}</button>)}</div>
        </div>
        {colorMode === "regolith" && <p className="mt-1.5 text-[.54rem] leading-relaxed text-muted-foreground">Stylised colouring from elevation, slope and ridge/rim curvature (dark mare to bright highland). It is not measured albedo.</p>}
        {colorMode === "slope" && <p className="mt-1.5 type-data text-[.54rem] text-muted-foreground"><span className="text-[#7fa58a]">■</span> &lt;5° <span className="text-[#c9c36a]">■</span> 5–10° <span className="text-[#e39a4f]">■</span> 10–15° <span className="text-retro-red">■</span> &gt;15°</p>}
        {colorMode === "elevation" && tile && <div className="mt-1.5"><div className="h-1.5 rounded-full bg-[linear-gradient(90deg,#7a3cff,#2f6bff,#22c7c7,#4fd65a,#f2e93a,#f2902a,#e02424)]" /><div className="mt-0.5 flex justify-between type-data text-[.52rem] text-muted-foreground"><span>{Math.round(tile.minM).toLocaleString()} m</span><span>{Math.round(tile.maxM).toLocaleString()} m</span></div></div>}
        <p className="mt-2 text-[.56rem] leading-relaxed text-muted-foreground">
          {demLoading ? "Loading measured elevation…" : demError ? <span className="text-retro-red">Elevation unavailable ({demError}). Showing procedural terrain, which is illustrative only.</span>
            : tile ? <>LROC WAC GLD100 heights (via Lunaserv, ~{tile.source.nominalResolutionM} m posting) on a {tile.size}×{tile.size} grid, {km(tile.spacingM)} spacing. Relief {Math.round(tile.minM).toLocaleString()} to {Math.round(tile.maxM).toLocaleString()} m above the 1737.4 km sphere. Curvature is to scale{exaggeration !== 1 ? `; relief is exaggerated ${exaggeration}× and not to scale` : ""}.</> : null}
        </p>
      </div>

      <div className="border-t border-line/80 pt-3">
        <div className="flex items-center gap-1.5 type-data text-[.58rem] uppercase tracking-[.12em] text-retro-red"><Hammer size={13} />Place hardware</div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {SURFACE_OBJECT_TYPES.map((type) => <button key={type} type="button" disabled={!tile} onClick={() => onBuildType(buildType === type ? null : type)} aria-pressed={buildType === type}
            title={SURFACE_OBJECTS[type].description}
            className={`rounded border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${buildType === type ? "border-retro-red/70 bg-retro-red/10" : "border-line/80 hover:border-retro-purple/50"}`}>
            <span className={`block text-[.66rem] ${buildType === type ? "text-retro-red" : "text-bone"}`}>{SURFACE_OBJECTS[type].label}</span>
            <span className="type-data block text-[.52rem] text-muted-foreground">≤{SURFACE_OBJECTS[type].maxSlopeDeg}° slope · {SURFACE_OBJECTS[type].footprintM * 2} m</span>
          </button>)}
        </div>
        {buildType && <div className="mt-2 rounded border border-retro-red/30 bg-retro-red/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="type-data text-[.56rem] uppercase tracking-[.1em] text-muted-foreground">Heading {Math.round(heading)}°</span>
            <span className="flex gap-1">
              <button type="button" aria-label="Rotate left 15 degrees" onClick={() => onHeading(heading - 15)} className="grid size-7 place-items-center rounded border border-line text-bone hover:border-retro-purple/60"><RotateCcw size={13} /></button>
              <button type="button" aria-label="Rotate right 15 degrees" onClick={() => onHeading(heading + 15)} className="grid size-7 place-items-center rounded border border-line text-bone hover:border-retro-purple/60"><RotateCw size={13} /></button>
            </span>
          </div>
          <p role="status" className={`mt-1.5 type-data text-[.56rem] ${hoverCheck && !hoverCheck.ok ? "text-retro-red" : "text-muted-foreground"}`}>
            {hoverCheck ? hoverCheck.ok ? `Click to place · ground slope ${hoverCheck.slopeDeg.toFixed(1)}°` : hoverCheck.reason : "Point at the ground to preview"}
          </p>
          <p className="mt-1 text-[.54rem] leading-relaxed text-muted-foreground">Left-click places. Drag to rotate the view, right-drag or WASD to pan. Q / E rotate the item, Esc stops placing.</p>
        </div>}
      </div>

      {setupDetails}

      <div className="border-t border-line/80 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 type-data text-[.58rem] uppercase tracking-[.12em] text-retro-blue"><Box size={13} />Placed · {placements.length}</div>
          {placements.length > 0 && <button type="button" onClick={onClear} className="type-data text-[.54rem] uppercase tracking-[.1em] text-muted-foreground hover:text-retro-red">Clear all</button>}
        </div>
        {placements.length === 0 ? <p className="mt-1.5 text-[.58rem] text-muted-foreground">Nothing placed at this site yet. Placements are saved in this browser for this site.</p>
          : <ul className="mt-1.5 space-y-1">{placements.map((p) => {
            const status = statusFor(p);
            const distance = Math.hypot(p.eastM, p.northM);
            return <li key={p.id} aria-current={p.id === selectedId} className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-2 py-1.5 ${p.id === selectedId ? "border-retro-purple/70 bg-retro-purple/10" : "border-line/70 hover:border-retro-purple/40"}`}>
              <button type="button" onClick={() => onSelect(p.id)} aria-pressed={p.id === selectedId} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[.64rem] text-bone">{SURFACE_OBJECTS[p.type].label}</div>
                <div className="type-data text-[.52rem] text-muted-foreground">{km(distance)} from centre · slope {status ? status.slopeDeg.toFixed(1) : "—"}°</div>
                {status && <div className="type-data text-[.52rem]">
                  <span className={status.sunVisible > 0 ? "text-retro-red" : "text-muted-foreground"}>{status.sunVisible > 0.99 ? "☀ Sunlit" : status.sunVisible > 0 ? "☀ Partly lit" : "☾ In shadow"}</span>
                  {p.type === "solar" && status.powerKw !== null && <span className="text-bone"> · ≈{status.powerKw.toFixed(1)} kW</span>}
                  {p.type === "comms" && <span className={status.earthVisible > 0 ? "text-retro-blue" : "text-muted-foreground"}> · {status.earthVisible > 0 ? "Earth in view" : "No Earth line of sight"}</span>}
                </div>}
                {status?.daily && <div className="type-data text-[.52rem] text-muted-foreground">Today: {status.daily.sunHours !== null && <span className="text-retro-red">{status.daily.sunHours.toFixed(1)} h sun</span>}{p.type === "solar" && <span className="text-bone"> · ≈{status.daily.kwh.toFixed(0)} kWh</span>}{p.type === "comms" && <span className="text-retro-blue"> · Earth {status.daily.earthHours.toFixed(1)} h</span>}</div>}
              </button>
              <div className="flex shrink-0 items-center">
                <button type="button" aria-label={`Teleport to ${SURFACE_OBJECTS[p.type].label}`} title="Teleport to this object" onClick={(e) => { e.stopPropagation(); onView(p); }} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-retro-purple/15 hover:text-retro-purple"><Eye size={13} /></button>
                <button type="button" aria-label={`Remove ${SURFACE_OBJECTS[p.type].label}`} onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={13} /></button>
              </div>
            </li>;
          })}</ul>}
        {solarKwh > 0 && <p className="mt-1.5 type-data text-[.56rem] text-bone">Solar today ≈ {solarKwh.toFixed(0)} kWh from {placements.filter((p) => p.type === "solar").length} array{placements.filter((p) => p.type === "solar").length === 1 ? "" : "s"}</p>}
        {graphsAvailable && placements.some((p) => p.type === "solar" || p.type === "comms") && <Link href="/freeplay" onClick={() => useFreeplay.getState().setView("orbit")} className="mt-2 inline-flex items-center gap-1.5 rounded border border-retro-blue/40 bg-retro-blue/10 px-2.5 py-1.5 type-data text-[.56rem] uppercase tracking-[.1em] text-retro-blue hover:bg-retro-blue/20"><LineChart size={12} />Graphs: generation &amp; comms windows</Link>}
        {placements.length > 0 && <p className="mt-1.5 text-[.52rem] leading-relaxed text-muted-foreground">Sunlight uses the stored Horizons ephemeris and only the terrain inside the walls, so it is an upper bound near the edge. Power assumes an 18 m² sun-tracking panel at 30% efficiency.</p>}
      </div>
    </div>
  </section>;
}
