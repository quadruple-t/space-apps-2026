"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { earthUp, sunUp } from "@/lib/illumination";
import { useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";
import { SitePreview } from "./site-preview";

type CandidateMetrics = { sunlight: number; earth: number; terrain: string };

function useCandidateMetrics(site: FreeplaySite | null, startIso: string, hours: number) {
  const result = useLunarWindow(site, startIso, hours, !!site);
  const metrics = useMemo<CandidateMetrics | null>(() => {
    const samples = result.data?.samples ?? [];
    if (!samples.length) return null;
    return {
      sunlight: Math.round(samples.filter(sunUp).length / samples.length * 100),
      earth: Math.round(samples.filter(earthUp).length / samples.length * 100),
      terrain: result.data?.horizon.source ?? "unknown",
    };
  }, [result.data]);
  return { metrics, loading: result.loading, error: result.error };
}

function SitePlacard({ site, label, metrics, loading, error, active, onSelect }: {
  site: FreeplaySite;
  label: string;
  metrics: CandidateMetrics | null;
  loading: boolean;
  error: string | null;
  active: boolean;
  onSelect: () => void;
}) {
  return <button type="button" aria-pressed={active} onClick={onSelect} className={`min-w-0 overflow-hidden border bg-void/60 text-left transition-colors ${active ? "border-retro-purple ring-1 ring-retro-purple/40" : "border-retro-purple/30 hover:border-retro-purple/70"}`}>
    <SitePreview site={site} compact />
    <span className="block p-2">
      <span className="type-data block text-[.53rem] uppercase tracking-[.12em] text-retro-purple">{label}</span>
      <span className="mt-1 block min-h-8 text-xs font-semibold leading-snug text-bone">{site.name}</span>
      {metrics ? <>
        <Metric label="Sunlight" value={metrics.sunlight} color="bg-retro-red" text="text-retro-red" />
        <Metric label="Earth visible" value={metrics.earth} color="bg-retro-blue" text="text-retro-blue" />
        <span className="mt-2 block text-[.52rem] leading-relaxed text-muted-foreground">Horizon data · {metrics.terrain}</span>
      </> : <span className="mt-2 block min-h-10 text-[.58rem] leading-relaxed text-muted-foreground">{loading ? "Loading site conditions…" : error ? "Site data unavailable for this window." : "No samples available for this window."}</span>}
      <span className="mt-2 block border-t border-line/70 pt-2 type-data text-[.53rem] uppercase tracking-wide text-muted-foreground">Open this site in orbit view ↗</span>
    </span>
  </button>;
}

function Metric({ label, value, color, text }: { label: string; value: number; color: string; text: string }) {
  return <span className="mt-2 block">
    <span className={`flex justify-between gap-1 type-data text-[.58rem] ${text}`}><span>{label}</span><span>{value}%</span></span>
    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line"><span className={`block h-full ${color}`} style={{ width: `${value}%` }} /></span>
  </span>;
}

export function CandidateComparison({ sites, locked = false }: { sites: FreeplaySite[]; locked?: boolean }) {
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const startIso = useFreeplay((state) => state.startIso);
  const durationHours = useFreeplay((state) => state.durationHours);
  const selectedSite = useFreeplay((state) => state.site);
  const setSite = useFreeplay((state) => state.selectSite);
  const setView = useFreeplay((state) => state.setView);
  const inspectSite = (site: FreeplaySite) => {
    setSite(site, false);
    setView("orbit");
  };
  const first = sites.find((site) => site.id === firstId) ?? sites[0] ?? null;
  const second = sites.find((site) => site.id === secondId) ?? sites.find((site) => site.id !== first?.id) ?? null;
  const firstResult = useCandidateMetrics(first, startIso, durationHours);
  const secondResult = useCandidateMetrics(second, startIso, durationHours);
  if (!first || !second) return <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Two candidate locations are needed for a side-by-side comparison.</p>;

  const swap = () => { setFirstId(second.id); setSecondId(first.id); };
  const describeDifference = (label: string, a: number, b: number) => {
    const delta = a - b;
    if (delta === 0) return `Similar ${label.toLowerCase()} in this window.`;
    const winner = delta > 0 ? first.name : second.name;
    return `${winner} has ${Math.abs(delta)} points more ${label.toLowerCase()}.`;
  };

  return <div className="mt-3 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <p className="type-data text-[.6rem] uppercase tracking-[.12em] text-retro-purple">{locked ? "Preset · Apollo 11 vs Luna 9" : "Site comparison · same mission window"}</p>
      {!locked && <button type="button" onClick={swap} aria-label="Swap candidate places A and B" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-line px-2 type-data text-[.55rem] uppercase tracking-wide text-muted-foreground hover:border-retro-purple/60 hover:text-bone"><ArrowLeftRight size={12} />Swap</button>}
    </div>
    {locked && <p className="text-[.58rem] leading-relaxed text-muted-foreground">Fixed example pair. The next section lets you compare all available stops.</p>}
    {!locked && [{ value: first.id, label: "Place A", otherId: second.id, set: setFirstId }, { value: second.id, label: "Place B", otherId: first.id, set: setSecondId }].map((choice) => <label key={choice.label} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="w-12 shrink-0">{choice.label}</span><select aria-label={`${choice.label} candidate`} value={choice.value} onChange={(event) => {
      const next = sites.find((site) => site.id === event.target.value);
      choice.set(event.target.value);
      if (next) inspectSite(next);
    }} className="hud-input min-w-0 flex-1 text-xs normal-case tracking-normal">
      {sites.map((site) => <option key={site.id} value={site.id} disabled={site.id === choice.otherId}>{site.name}</option>)}
    </select></label>)}
    <div className="grid grid-cols-2 gap-2">
      <SitePlacard label="Place A" site={first} metrics={firstResult.metrics} loading={firstResult.loading} error={firstResult.error} active={selectedSite?.id === first.id} onSelect={() => inspectSite(first)} />
      <SitePlacard label="Place B" site={second} metrics={secondResult.metrics} loading={secondResult.loading} error={secondResult.error} active={selectedSite?.id === second.id} onSelect={() => inspectSite(second)} />
    </div>
    {firstResult.metrics && secondResult.metrics && <div className="rounded border border-retro-blue/25 bg-retro-blue/5 p-2">
      <p className="type-data text-[.55rem] uppercase tracking-wide text-retro-blue">Trade-off readout</p>
      <p className="mt-1 text-[.62rem] leading-relaxed text-bone">{describeDifference("sunlight", firstResult.metrics.sunlight, secondResult.metrics.sunlight)} {describeDifference("Earth visibility", firstResult.metrics.earth, secondResult.metrics.earth)}</p>
    </div>}
    <p className="text-[.58rem] leading-relaxed text-muted-foreground">Sunlight can support solar power; Earth visibility can open more contact time. Bars show the share of sampled hours. Select a card to inspect its orbit. Some points are approximate; this comparison does not confirm resources or recommend a landing.</p>
  </div>;
}
