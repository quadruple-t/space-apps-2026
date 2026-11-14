"use client";

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, MapPin, X } from "lucide-react";
import type { LunarSite } from "@/integrations/science/types";
import { interpolateTerrain, MOON_REGIONS, SCAFFOLD_MOON_GRID, type MoonRegion } from "@/integrations/terrain/moon-samples";
import { MoonSunDiagram } from "@/components/graphics/moon-sun-diagram";

type Props = {
  selectedSite: LunarSite;
  onSelect: (site: LunarSite) => void;
  onContinue: () => void;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  mode?: "setup" | "hud";
  onClose?: () => void;
};
const mapX = (longitudeDeg: number) => (longitudeDeg / 360) * 720;
const mapY = (latitudeDeg: number) => ((90 - latitudeDeg) / 180) * 360;
type CatalogSite = { id: string; name: string; family: string; latDeg: number | null; lonDeg: number | null; pointIsApproximate: boolean };
type CatalogDetail = { site?: { coordinates?: { elevationM?: number | null } | null; terrainSummary?: { slope100mDeg?: number | null } | null }; terrain?: { slope100mDeg?: number | null } | null };

function LunarMap({ selectedSite, onSelect }: Pick<Props, "selectedSite" | "onSelect">) {
  const selectCoordinates = (latitudeDeg: number, longitudeDeg: number) => {
    const lat = Number(Math.max(-90, Math.min(90, latitudeDeg)).toFixed(2));
    const lon = Number((((longitudeDeg % 360) + 360) % 360).toFixed(2));
    onSelect({ id: `map-${lat}-${lon}`, name: "Selected map point", latitudeDeg: lat, longitudeDeg: lon, coordinateReference: "Planetocentric latitude, east-positive longitude", provenance: "user" });
  };
  const selectMapPoint = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    selectCoordinates(90 - y * 180, x * 360);
  };
  const moveMapPoint = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 15 : 5;
    const moves: Record<string, [number, number]> = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    selectCoordinates(selectedSite.latitudeDeg + move[0], selectedSite.longitudeDeg + move[1]);
  };

  return <div className="mt-3 overflow-hidden rounded border border-retro-purple/25 bg-[#090817] p-1.5">
    <svg viewBox="0 0 720 360" role="group" data-no-flight-controls aria-label={`Lunar coordinate map. Selected ${selectedSite.latitudeDeg.toFixed(2)} degrees latitude, ${selectedSite.longitudeDeg.toFixed(2)} degrees east longitude. Use arrow keys to adjust by 5 degrees, or Shift plus an arrow for 15 degrees.`} tabIndex={0} onKeyDown={moveMapPoint} onClick={selectMapPoint} className="block w-full cursor-crosshair touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-retro-purple">
      <defs>
        <linearGradient id="moonHudBase" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#504b79"/><stop offset=".5" stopColor="#918ba8"/><stop offset="1" stopColor="#393759"/></linearGradient>
        <pattern id="moonHudGrain" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="6" cy="8" r="1" fill="#dbefff" opacity=".14"/><circle cx="21" cy="19" r=".8" fill="#17162d" opacity=".25"/></pattern>
      </defs>
      <rect width="720" height="360" rx="4" fill="url(#moonHudBase)"/><rect width="720" height="360" fill="url(#moonHudGrain)"/>
      <g fill="#292844" fillOpacity=".45" stroke="#dbe7ff" strokeOpacity=".2" strokeWidth="2">
        {[[68,76,31],[158,145,48],[277,70,34],[365,214,54],[503,95,42],[625,183,58],[87,277,38],[238,286,25],[470,297,33],[671,45,25],[553,205,19],[322,127,17],[419,52,21],[18,194,18]].map(([cx,cy,r],i)=><circle key={i} cx={cx} cy={cy} r={r}/>)}
      </g>
      <g strokeDasharray="3 6" strokeOpacity=".46" pointerEvents="none">
        {[90,180,270].map((x)=><path key={`x-${x}`} d={`M${x} 0V360`} stroke="#a986ff"/>)}
        {[90,180,270].map((y)=><path key={`y-${y}`} d={`M0 ${y}H720`} stroke="#4b9bff"/>)}
      </g>
      <g pointerEvents="none">{MOON_REGIONS.map((region)=><circle key={region.id} cx={mapX(region.site.longitudeDeg)} cy={mapY(region.site.latitudeDeg)} r="5" fill="#ff5364" stroke="#171224" strokeWidth="2"/>)}</g>
      <g transform={`translate(${mapX(selectedSite.longitudeDeg)},${mapY(selectedSite.latitudeDeg)})`} pointerEvents="none"><circle r="12" fill="none" stroke="#e3dcff" strokeWidth="1.5" strokeDasharray="3 3"/><path d="M-6 0H6M0-6V6" stroke="#e3dcff" strokeWidth="1.5"/></g>
    </svg>
  </div>;
}

export function MoonLocationPicker({ selectedSite, onSelect, onContinue, sunAzimuthDeg, sunElevationDeg, mode = "setup", onClose }: Props) {
  const selectedRegion = MOON_REGIONS.find((region) => region.site.id === selectedSite.id)?.id ?? null;
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [formError, setFormError] = useState("");
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const estimate = useMemo(() => interpolateTerrain(SCAFFOLD_MOON_GRID, selectedSite.latitudeDeg, selectedSite.longitudeDeg), [selectedSite.latitudeDeg, selectedSite.longitudeDeg]);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/catalog/sites")
      .then(async (response) => {
        if (!response.ok) throw new Error("Site catalog unavailable");
        return response.json() as Promise<{ sites?: CatalogSite[] }>;
      })
      .then((data) => { if (active) setCatalogSites((data.sites ?? []).filter((site) => site.latDeg !== null && site.lonDeg !== null && !site.pointIsApproximate)); })
      .catch(() => { if (active) setCatalogError("Catalog sites unavailable"); });
    return () => { active = false; };
  }, []);

  const selectRegion = (region: MoonRegion) => onSelect(region.site);
  const selectNode = (latitudeDeg: number, longitudeDeg: number, label: string) => {
    onSelect({ id: `grid-${latitudeDeg}-${longitudeDeg}`, name: label, latitudeDeg, longitudeDeg, coordinateReference: "Planetocentric latitude, east-positive longitude", provenance: "illustrative" });
  };
  const selectCatalogSite = async (id: string) => {
    const site = catalogSites.find((candidate) => candidate.id === id);
    if (!site || site.latDeg === null || site.lonDeg === null) return;
    try {
      const response = await fetch(`/api/v1/catalog/sites/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Site detail unavailable");
      const details = await response.json() as CatalogDetail;
      onSelect({
        id: site.id, name: site.name, latitudeDeg: site.latDeg, longitudeDeg: site.lonDeg,
        coordinateReference: "Planetocentric latitude, east-positive longitude",
        provenance: "scientific", elevationMeters: details.site?.coordinates?.elevationM ?? null,
        slopeDeg: details.terrain?.slope100mDeg ?? details.site?.terrainSummary?.slope100mDeg ?? null,
      });
    } catch {
      setCatalogError("Could not load this site's terrain record");
    }
  };
  const submitCoordinates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) { setFormError("Enter numeric coordinates."); return; }
    if (lat < -90 || lat > 90) { setFormError("Latitude must be between −90° and +90°."); return; }
    if (lon < 0 || lon >= 360) { setFormError("East longitude must be from 0° to less than 360°."); return; }
    setFormError("");
    onSelect({ id: `custom-${lat}-${lon}`, name: name.trim() || "Custom site", latitudeDeg: lat, longitudeDeg: lon, coordinateReference: "Planetocentric latitude, east-positive longitude", provenance: "user" });
  };

  const sideCards = <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {MOON_REGIONS.map((region)=><button key={region.id} type="button" onClick={()=>selectRegion(region)} aria-pressed={selectedRegion===region.id} className={`group rounded-lg border p-3 text-left transition ${selectedRegion===region.id?"border-retro-purple/70 bg-retro-purple/15 shadow-[0_0_22px_rgba(169,134,255,0.12)]":"border-line bg-void/45 hover:border-retro-blue/50 hover:bg-void/70"}`}>
      <span className={`block text-xs font-medium ${selectedRegion===region.id?"text-retro-purple":"text-bone"}`}>{region.label}</span><span className="mt-1 block text-[0.58rem] leading-relaxed text-muted-foreground">{region.note}</span>
    </button>)}
  </div>;

  const sampleReadout = <>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="hud-readout"><div className="hud-label">Interpolated elevation</div><div className="type-data mt-1 text-base text-bone">{Math.round(estimate.elevationMeters).toLocaleString()} <span className="text-xs text-muted-foreground">m</span></div></div>
      <div className="hud-readout"><div className="hud-label">Terrain slope</div><div className="type-data mt-1 text-base text-bone">{estimate.slopeDeg.toFixed(1)}<span className="text-xs text-muted-foreground">°</span></div></div>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {estimate.corners.map((point,index)=><button key={`${point.latitudeDeg}-${point.longitudeDeg}-${index}`} type="button" onClick={()=>selectNode(point.latitudeDeg,point.longitudeDeg,`Grid point ${String.fromCharCode(65+index)}`)} className="hud-readout text-left transition hover:border-retro-blue/60" title="Select this grid point">
        <div className="type-data text-[0.56rem] text-retro-blue">NODE {String.fromCharCode(65+index)} · {point.latitudeDeg}° / {point.longitudeDeg}°E</div><div className="type-data mt-1 text-[0.66rem] text-bone">{point.elevationMeters.toLocaleString()} m <span className="text-muted-foreground">· {point.slopeDeg}°</span></div>
      </button>)}
    </div>
    <p className="mt-2 text-[0.56rem] leading-relaxed text-muted-foreground">Synthetic 45° × 45° latitude/longitude grid scaffold (~1,360 km per longitude step at the equator); not measured LOLA terrain. At either pole, the scaffold elevation is constant across longitude.</p>
  </>;
  const terrainReadout = selectedSite.provenance === "scientific" ? <>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="hud-readout"><div className="hud-label">Site elevation</div><div className="type-data mt-1 text-base text-bone">{selectedSite.elevationMeters == null ? "Unavailable" : <>{Math.round(selectedSite.elevationMeters).toLocaleString()} <span className="text-xs text-muted-foreground">m</span></>}</div></div>
      <div className="hud-readout"><div className="hud-label">Terrain slope</div><div className="type-data mt-1 text-base text-bone">{selectedSite.slopeDeg == null ? "Unavailable" : <>{selectedSite.slopeDeg.toFixed(1)}<span className="text-xs text-muted-foreground">°</span></>}</div></div>
    </div>
    <p className="mt-2 text-[0.56rem] leading-relaxed text-muted-foreground">Site metrics and horizon use the catalog&apos;s precomputed LOLA terrain record. The rendered 3D surface remains procedural.</p>
  </> : sampleReadout;
  const catalogSelect = <label className="mt-3 block text-[0.58rem] text-muted-foreground">Verified catalog site<select value={selectedSite.provenance === "scientific" ? selectedSite.id : ""} onChange={(event)=>{if(event.target.value)void selectCatalogSite(event.target.value);}} className="hud-input mt-1"><option value="">Choose a site with measured coordinates</option>{catalogSites.map((site)=><option key={site.id} value={site.id}>{site.name} · {site.family}</option>)}</select>{catalogError && <span role="status" className="mt-1 block text-retro-red">{catalogError}</span>}</label>;

  const customForm = <details className="mt-3 border-t border-line/80 pt-2">
    <summary className="cursor-pointer text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-bone">Enter custom coordinates</summary>
    <form onSubmit={submitCoordinates} className="mt-2 grid grid-cols-2 gap-2">
      <label className="col-span-2 text-[0.58rem] text-muted-foreground">Site name<input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Optional" className="hud-input mt-1"/></label>
      <label className="text-[0.58rem] text-muted-foreground">Latitude °<input inputMode="decimal" value={latitude} onChange={(event)=>setLatitude(event.target.value)} placeholder="−90…+90" className="hud-input mt-1"/></label>
      <label className="text-[0.58rem] text-muted-foreground">Longitude E<input inputMode="decimal" value={longitude} onChange={(event)=>setLongitude(event.target.value)} placeholder="0…360" className="hud-input mt-1"/></label>
      {formError && <p role="alert" className="col-span-2 text-[0.62rem] text-destructive">{formError}</p>}
      <button type="submit" className="col-span-2 rounded border border-retro-purple/50 bg-retro-purple/10 px-2 py-2 text-[0.62rem] uppercase tracking-[0.1em] text-retro-purple hover:bg-retro-purple/20">Load coordinates</button>
    </form>
  </details>;

  if (mode === "hud") return <section className="hud-panel h-full overflow-y-auto p-3 sm:p-4" aria-label="Lunar map and terrain samples">
    <div className="flex items-start justify-between"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-purple">Navigation map</div><h2 className="type-heading mt-1 text-sm text-bone">Lunar surface</h2></div>{onClose && <button type="button" aria-label="Close lunar map" onClick={onClose} className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={15}/></button>}</div>
    <LunarMap selectedSite={selectedSite} onSelect={(site)=>{onSelect(site);}}/>
    <div className="mt-2 grid grid-cols-3 gap-1.5">{MOON_REGIONS.map((region)=><button key={region.id} type="button" onClick={()=>selectRegion(region)} aria-pressed={selectedRegion===region.id} className={`rounded border px-2 py-1.5 text-left text-[0.63rem] transition ${selectedRegion===region.id?"border-retro-purple/70 bg-retro-purple/10 text-retro-purple":"border-line/80 text-muted-foreground hover:border-retro-blue/60 hover:text-bone"}`}>{region.label}</button>)}</div>
    <div className="mt-3 flex items-center gap-2 border-t border-line/80 pt-3"><MapPin size={14} className="shrink-0 text-retro-red"/><div className="min-w-0 flex-1"><div className="truncate text-xs text-bone">{selectedSite.name}</div><div className="type-data mt-0.5 text-[0.6rem] text-muted-foreground">{selectedSite.latitudeDeg.toFixed(2)}° / {selectedSite.longitudeDeg.toFixed(2)}° E</div></div></div>
    {catalogSelect}{terrainReadout}{customForm}
    <button type="button" onClick={onContinue} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded bg-retro-purple px-3 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void hover:bg-[#c2aaff]">Fly to selected point <ArrowRight size={14}/></button>
  </section>;

  return <div className="absolute inset-0 z-30 overflow-y-auto bg-void/55 backdrop-blur-[3px]">
    <div className="mx-auto flex min-h-full max-w-[1240px] flex-col justify-center p-3 sm:p-6 lg:p-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div><div className="type-data text-[0.62rem] uppercase tracking-[0.19em] text-retro-purple">Freeplay setup · step 1 of 2</div><h1 className="type-heading mt-2 text-2xl text-bone sm:text-4xl">Choose your side of the Moon.</h1><p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">Pick a lunar region, then begin descent. The simulation will fly to your selected coordinates and reveal the local conditions on arrival.</p></div>
        <div className={`type-data text-[0.6rem] uppercase tracking-[0.12em] ${selectedSite.provenance === "scientific" ? "text-retro-blue" : "text-retro-red"}`}>{selectedSite.provenance === "scientific" ? "LOLA terrain · JPL Horizons" : "Illustrative region data"}</div>
      </header>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
        <section className="hud-panel p-3 sm:p-5" aria-label="Choose a lunar side">
          <div className="type-data text-[0.6rem] uppercase tracking-[0.14em] text-retro-blue">01 · Select approach region</div>
          <div className="mt-3">{sideCards}</div>
          <div className="mt-4 flex items-center justify-between gap-3"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">Refine on the Moon dial</div><div className="mt-1 text-[0.62rem] text-muted-foreground">Tap anywhere to choose exact coordinates</div></div><div className="type-data text-right text-[0.62rem] text-bone">{selectedSite.latitudeDeg.toFixed(2)}°<br/>{selectedSite.longitudeDeg.toFixed(2)}° E</div></div>
          {catalogSelect}<LunarMap selectedSite={selectedSite} onSelect={(site)=>{onSelect(site);}}/>
          {customForm}
        </section>
        <div className="flex flex-col gap-3">
          <MoonSunDiagram latitudeDeg={selectedSite.latitudeDeg} longitudeDeg={selectedSite.longitudeDeg} sunAzimuthDeg={sunAzimuthDeg} sunElevationDeg={sunElevationDeg}/>
          <section className="hud-panel p-3 sm:p-4" aria-label="Selected terrain estimate">
            <div className="flex items-start justify-between gap-3"><div><div className="type-data text-[0.58rem] uppercase tracking-[0.14em] text-retro-blue">Selected region</div><h2 className="mt-1 text-sm text-bone">{selectedSite.name}</h2></div><span className={`rounded border px-2 py-1 type-data text-[0.56rem] uppercase ${selectedSite.provenance === "scientific" ? "border-retro-blue/35 bg-retro-blue/10 text-retro-blue" : "border-retro-red/35 bg-retro-red/10 text-retro-red"}`}>{selectedSite.provenance === "scientific" ? "LOLA DEM" : SCAFFOLD_MOON_GRID.provenance}</span></div>
            {terrainReadout}
            <button type="button" onClick={onContinue} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-retro-red px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-void transition hover:bg-[#ff91a2]">Begin descent <ArrowRight size={15}/></button>
            <p className="mt-2 text-[0.58rem] leading-relaxed text-muted-foreground">The coordinates and conditions update from the selected point. {selectedSite.provenance === "scientific" ? "The terrain profile and metrics use precomputed LOLA data; rendered geometry remains procedural." : "The terrain readouts use the illustrative scaffold until you select a measured catalog site."}</p>
          </section>
        </div>
      </div>
    </div>
  </div>;
}
