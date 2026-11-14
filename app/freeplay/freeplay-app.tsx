"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Globe2, Orbit } from "lucide-react";
import { usePlaybackClock } from "@/components/freeplay/time-controls";
import { useFreeplay, type FreeplayView } from "@/lib/freeplay-store";

const Loading = ({ label }: { label: string }) =>
  <div className="grid h-full place-items-center"><span className="type-data animate-pulse text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Loading {label}…</span></div>;

const GlobeScreen = dynamic(() => import("./globe-screen").then((m) => m.GlobeScreen), { ssr: false, loading: () => <Loading label="Moon globe" /> });
const OrbitScreen = dynamic(() => import("./orbit-screen").then((m) => m.OrbitScreen), { ssr: false, loading: () => <Loading label="orbit view" /> });

const TABS: { id: FreeplayView; label: string; Icon: typeof Globe2 }[] = [
  { id: "globe", label: "Globe", Icon: Globe2 },
  { id: "orbit", label: "Orbit + Graphs", Icon: Orbit },
];

export function FreeplayApp() {
  const view = useFreeplay((s) => s.view);
  const site = useFreeplay((s) => s.site);
  const setView = useFreeplay((s) => s.setView);
  const hydrate = useFreeplay((s) => s.hydrate);
  usePlaybackClock();
  useEffect(() => { hydrate(); }, [hydrate]);

  return <div className="flex h-dvh flex-col bg-void pt-(--nav-height)">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
      <div className="flex items-center gap-3">
        <h1 className="type-heading text-sm text-bone sm:text-base">Freeplay</h1>
        <div role="tablist" aria-label="Freeplay screens" className="flex overflow-hidden rounded border border-line">
          {TABS.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`type-data flex items-center gap-1.5 px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] ${view === id ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>
            <Icon size={13} />{label}
          </button>)}
        </div>
      </div>
      <div className="type-data min-w-0 truncate text-[0.62rem] text-muted-foreground">
        {site
          ? <><span className="text-bone">{site.name}</span> · {site.latitudeDeg.toFixed(3)}°, {site.longitudeDeg.toFixed(3)}° E · r {site.radiusKm} km</>
          : "No site selected · click the Moon to pick one"}
      </div>
    </header>
    <div className="relative min-h-0 flex-1">
      {view === "globe" ? <GlobeScreen /> : <OrbitScreen />}
    </div>
  </div>;
}
