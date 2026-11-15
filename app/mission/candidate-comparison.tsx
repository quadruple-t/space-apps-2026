"use client";

import { useMemo, useState } from "react";
import type { FreeplaySite } from "@/data/sites";
import { earthUp, sunUp } from "@/lib/illumination";
import { useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";
import { SitePreview } from "./site-preview";

function SiteColumn({ site, startIso, hours, onSelect }: { site: FreeplaySite; startIso: string; hours: number; onSelect: () => void }) {
  const result = useLunarWindow(site, startIso, hours);
  const metrics = useMemo(() => {
    const samples = result.data?.samples ?? [];
    if (!samples.length) return null;
    return {
      sunlight: Math.round(samples.filter(sunUp).length / samples.length * 100),
      earth: Math.round(samples.filter(earthUp).length / samples.length * 100),
      terrain: result.data?.horizon.source ?? "unknown",
    };
  }, [result.data]);

  return <button type="button" onClick={onSelect} className="overflow-hidden border border-retro-purple/35 bg-void/60 text-left hover:border-retro-purple">
    <SitePreview site={site} compact />
    <span className="block p-2"><span className="block truncate text-xs font-semibold text-bone">{site.name}</span>
      {metrics ? <><span className="mt-2 block text-[.62rem] text-retro-red">Sunlight · {metrics.sunlight}%</span><span className="mt-1 h-1 overflow-hidden rounded bg-line"><span className="block h-full bg-retro-red" style={{ width: `${metrics.sunlight}%` }} /></span><span className="mt-2 block text-[.62rem] text-retro-blue">Earth visible · {metrics.earth}%</span><span className="mt-1 h-1 overflow-hidden rounded bg-line"><span className="block h-full bg-retro-blue" style={{ width: `${metrics.earth}%` }} /></span><span className="mt-2 block text-[.52rem] text-muted-foreground">Horizon: {metrics.terrain}</span></>
        : <span className="mt-2 block text-[.58rem] text-muted-foreground">{result.loading ? "Loading site conditions…" : result.error ? "Site data unavailable" : "No samples available"}</span>}
    </span>
  </button>;
}

export function CandidateComparison({ sites }: { sites: FreeplaySite[] }) {
  const [firstId, setFirstId] = useState(sites[0]?.id ?? "");
  const [secondId, setSecondId] = useState(sites[1]?.id ?? "");
  const startIso = useFreeplay((state) => state.startIso);
  const durationHours = useFreeplay((state) => state.durationHours);
  const setSite = useFreeplay((state) => state.selectSite);
  const first = sites.find((site) => site.id === firstId) ?? sites[0];
  const second = sites.find((site) => site.id === secondId) ?? sites[1];
  if (!first || !second) return <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Two candidate locations are needed for a side-by-side comparison.</p>;

  return <div className="mt-3 space-y-2">
    <p className="type-data text-[.6rem] uppercase tracking-[.12em] text-retro-purple">Choose two places · same mission window</p>
    {[{ value: firstId, set: setFirstId, label: "Place A" }, { value: secondId, set: setSecondId, label: "Place B" }].map((choice) => <label key={choice.label} className="flex items-center gap-2 text-xs text-muted-foreground">{choice.label}<select value={choice.value} onChange={(event) => { const selected = sites.find((site) => site.id === event.target.value); choice.set(event.target.value); if (selected) setSite(selected, false); }} className="hud-input min-w-0 flex-1 text-xs normal-case tracking-normal">{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>)}
    <div className="grid grid-cols-2 gap-2">
      <SiteColumn key={first.id} site={first} startIso={startIso} hours={durationHours} onSelect={() => setSite(first, false)} />
      <SiteColumn key={second.id} site={second} startIso={startIso} hours={durationHours} onSelect={() => setSite(second, false)} />
    </div>
    <p className="text-[.58rem] leading-relaxed text-muted-foreground">More sunlight can mean more time for solar charging. More Earth visibility can mean more direct-contact hours. Bars compare the share of sampled hours in your chosen window. Click a card to open its orbit graph. Candidate points may be approximate; this is a learning exercise, not a landing recommendation.</p>
  </div>;
}
