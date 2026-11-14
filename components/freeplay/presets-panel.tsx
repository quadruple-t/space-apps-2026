"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Save, Trash2 } from "lucide-react";
import { PRESET_SITES, type FreeplaySite } from "@/data/sites";
import { useFreeplay } from "@/lib/freeplay-store";

const fmtLat = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? "S" : "N"}`;
const fmtLon = (v: number) => `${v.toFixed(3)}°E`;

function Row({ site, selected, compact }: { site: FreeplaySite; selected: boolean; compact: boolean }) {
  const { selectSite, saveCurrentSite, renameSaved, setSavedRadius, deleteSaved, setRadius } = useFreeplay.getState();
  const isSaved = site.kind === "saved";
  const [name, setName] = useState(site.name);
  const [radius, setRadiusText] = useState(String(site.radiusKm));
  const commitRadius = () => {
    const km = Number(radius);
    if (!Number.isFinite(km) || km <= 0) { setRadiusText(String(site.radiusKm)); return; }
    if (isSaved) setSavedRadius(site.id, km);
    if (selected) setRadius(km);
  };

  return <tr onClick={() => selectSite(site, true)} aria-selected={selected}
    className={`cursor-pointer border-t border-line/60 align-middle ${selected ? "bg-retro-red/10" : "hover:bg-bone/5"}`}>
    <td className="py-1.5 pl-2 pr-2">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={selected ? "text-retro-red" : isSaved ? "text-retro-purple" : site.verified ? "text-bone" : "text-muted-foreground"}>★</span>
        {isSaved
          ? <input value={name} aria-label="Site name" onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)}
              onBlur={() => renameSaved(site.id, name.trim() || site.name)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1 text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
          : <span className="whitespace-nowrap text-bone">{site.name}</span>}
        {!site.verified && site.kind === "preset" && <span title={site.source} className="rounded border border-line px-1 text-[0.52rem] uppercase text-muted-foreground">approx</span>}
      </div>
    </td>
    <td className="whitespace-nowrap pr-2 tabular-nums">{fmtLat(site.latitudeDeg)}</td>
    <td className="whitespace-nowrap pr-2 tabular-nums">{fmtLon(site.longitudeDeg)}</td>
    <td className="pr-2">
      {isSaved || selected
        ? <input inputMode="decimal" value={radius} aria-label="Radius in km" onClick={(e) => e.stopPropagation()} onChange={(e) => setRadiusText(e.target.value)}
            onBlur={commitRadius} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-12 rounded border border-line bg-transparent px-1 tabular-nums text-bone focus:border-retro-purple focus:outline-none" />
        : <span className="tabular-nums">{site.radiusKm}</span>}
    </td>
    {!compact && <td className="whitespace-nowrap pr-2 text-muted-foreground">{site.program} · {site.country}</td>}
    <td className="pr-2 text-right">
      {isSaved
        ? <button type="button" aria-label={`Delete ${site.name}`} onClick={(e) => { e.stopPropagation(); deleteSaved(site.id); }}
            className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={13} /></button>
        : <button type="button" aria-label={`Save a copy of ${site.name}`} onClick={(e) => { e.stopPropagation(); selectSite(site, false); saveCurrentSite(); }}
            className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-retro-purple/15 hover:text-retro-purple"><Save size={13} /></button>}
    </td>
  </tr>;
}

export function PresetsPanel({ compact = false, collapsible = true, className = "" }: { compact?: boolean; collapsible?: boolean; className?: string }) {
  const site = useFreeplay((s) => s.site);
  const savedSites = useFreeplay((s) => s.savedSites);
  const [open, setOpen] = useState(true);

  return <section aria-label="Presets" className={`hud-panel flex min-h-0 flex-col ${className}`}>
    <header className="flex items-center justify-between gap-2 px-3 py-2">
      <div>
        <h2 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Presets</h2>
        {open && <p className="text-[0.56rem] text-muted-foreground">Click a row to fly there · ★ white = verified, grey = approximate, purple = saved</p>}
      </div>
      {collapsible && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse presets" : "Expand presets"}
        className="grid size-7 place-items-center rounded border border-line text-muted-foreground hover:text-bone">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>}
    </header>
    {open && <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
      <table className="type-data w-full text-left text-[0.6rem]">
        <thead className="sticky top-0 bg-[#0d0b1a] text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
          <tr><th className="py-1 pl-2 pr-2 font-normal">Name</th><th className="pr-2 font-normal">Lat</th><th className="pr-2 font-normal">Lon</th><th className="pr-2 font-normal">Radius km</th>{!compact && <th className="pr-2 font-normal">Program / Country</th>}<th className="pr-2 text-right font-normal">Save/Del</th></tr>
        </thead>
        <tbody>
          {savedSites.length > 0 && <tr><td colSpan={6} className="pl-2 pt-2 text-[0.54rem] uppercase tracking-[0.1em] text-retro-purple">My sites</td></tr>}
          {[...savedSites, null, ...PRESET_SITES].map((s) => {
            if (!s) return <tr key="divider"><td colSpan={6} className="pl-2 pt-2 text-[0.54rem] uppercase tracking-[0.1em] text-muted-foreground">Landing sites</td></tr>;
            const selected = s.id === site.id;
            const shown = selected ? { ...s, radiusKm: site.radiusKm } : s;
            return <Row key={`${s.id}:${shown.radiusKm}:${shown.name}`} site={shown} selected={selected} compact={compact} />;
          })}
        </tbody>
      </table>
    </div>}
  </section>;
}
