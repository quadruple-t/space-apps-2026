"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MousePointerClick, Trash2 } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { useFreeplay } from "@/lib/freeplay-store";

const fmtLat = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? "S" : "N"}`;
const fmtLon = (v: number) => `${v.toFixed(3)}°E`;

function Row({ site, selected }: { site: FreeplaySite; selected: boolean }) {
  const { selectSite, renameSaved, setSavedRadius, setRadius, deleteSaved } = useFreeplay.getState();
  const [name, setName] = useState(site.name);
  const [radius, setRadiusText] = useState(String(site.radiusKm));
  const commitRadius = () => {
    const km = Number(radius);
    if (!Number.isFinite(km) || km <= 0) { setRadiusText(String(site.radiusKm)); return; }
    setSavedRadius(site.id, km);
    if (selected) setRadius(km);
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return <tr onClick={() => selectSite(site, true)} aria-selected={selected}
    className={`cursor-pointer border-t border-line/60 align-middle ${selected ? "bg-retro-red/10" : "hover:bg-bone/5"}`}>
    <td className="py-1.5 pl-2 pr-2">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={selected ? "text-retro-red" : "text-retro-purple"}>★</span>
        <input value={name} aria-label="Site name" onClick={stop} onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n) renameSaved(site.id, n); else setName(site.name); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1 text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
      </div>
    </td>
    <td className="whitespace-nowrap pr-2 tabular-nums">{fmtLat(site.latitudeDeg)}</td>
    <td className="whitespace-nowrap pr-2 tabular-nums">{fmtLon(site.longitudeDeg)}</td>
    <td className="pr-2">
      <input inputMode="decimal" value={radius} aria-label="Radius in km" onClick={stop} onChange={(e) => setRadiusText(e.target.value)}
        onBlur={commitRadius} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-12 rounded border border-line bg-transparent px-1 tabular-nums text-bone focus:border-retro-purple focus:outline-none" />
    </td>
    <td className="pr-2 text-right">
      <button type="button" aria-label={`Delete ${site.name}`} onClick={(e) => { stop(e); deleteSaved(site.id); }}
        className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={13} /></button>
    </td>
  </tr>;
}

export function PresetsPanel({ collapsible = true, className = "" }: { collapsible?: boolean; className?: string }) {
  const site = useFreeplay((s) => s.site);
  const savedSites = useFreeplay((s) => s.savedSites);
  const [open, setOpen] = useState(true);

  return <section aria-label="Presets" className={`hud-panel flex min-h-0 flex-col ${className}`}>
    <header className="flex items-center justify-between gap-2 px-3 py-2">
      <div>
        <h2 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Presets{savedSites.length ? ` · ${savedSites.length}` : ""}</h2>
        {open && savedSites.length > 0 && <p className="text-[0.56rem] text-muted-foreground">Click a row to fly there · click a name or radius to edit</p>}
      </div>
      {collapsible && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse presets" : "Expand presets"}
        className="grid size-7 place-items-center rounded border border-line text-muted-foreground hover:text-bone">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>}
    </header>
    {open && (savedSites.length === 0
      ? <div className="flex items-start gap-2 px-3 pb-3 text-[0.62rem] leading-relaxed text-muted-foreground">
          <MousePointerClick size={15} className="mt-0.5 shrink-0 text-retro-purple" aria-hidden />
          <p>No presets yet. Click anywhere on the Moon to pick a site, then choose <span className="text-bone">Save to presets</span> and give it a name.</p>
        </div>
      : <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          <table className="type-data w-full text-left text-[0.6rem]">
            <thead className="sticky top-0 bg-[#0d0b1a] text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
              <tr><th className="py-1 pl-2 pr-2 font-normal">Name</th><th className="pr-2 font-normal">Lat</th><th className="pr-2 font-normal">Lon</th><th className="pr-2 font-normal">Radius km</th><th className="pr-2 text-right font-normal">Delete</th></tr>
            </thead>
            <tbody>
              {savedSites.map((s) => {
                const selected = s.id === site?.id;
                const shown = selected && site ? { ...s, radiusKm: site.radiusKm } : s;
                return <Row key={`${s.id}:${shown.radiusKm}:${shown.name}`} site={shown} selected={selected} />;
              })}
            </tbody>
          </table>
        </div>)}
  </section>;
}
