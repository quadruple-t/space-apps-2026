"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bot, Car, Globe2, Orbit } from "lucide-react";
import { ExpeditionControl, EXPEDITION_LAUNCHER_ID } from "@/components/expeditions/expedition-control";
import { ExpeditionPanel } from "@/components/expeditions/expedition-panel";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "@/components/freeplay/assistant-panel";
import { usePlaybackClock } from "@/components/freeplay/time-controls";
import type { FreeplaySite } from "@/data/sites";
import { useAssistant } from "@/lib/assistant/assistant-store";
import { driveHref } from "@/lib/drive-link";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { currentTimeMs, useFreeplay, type FreeplayView, type LayerId } from "@/lib/freeplay-store";

const Loading = ({ label }: { label: string }) =>
  <div className="grid h-full place-items-center"><span className="type-data animate-pulse text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Loading {label}…</span></div>;

const GlobeScreen = dynamic(() => import("./globe-screen").then((m) => m.GlobeScreen), { ssr: false, loading: () => <Loading label="Moon globe" /> });
const OrbitScreen = dynamic(() => import("./orbit-screen").then((m) => m.OrbitScreen), { ssr: false, loading: () => <Loading label="orbit view" /> });

const TABS: { id: FreeplayView; label: string; Icon: typeof Globe2 }[] = [
  { id: "globe", label: "Moon map", Icon: Globe2 },
  { id: "orbit", label: "Sun & Earth", Icon: Orbit },
];

/** Links to the surface view using the selected place and current mission time. */
function FreeplayPageLinks() {
  const site = useFreeplay((s) => s.site);
  const startIso = useFreeplay((s) => s.startIso);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const t = currentTimeMs({ startIso, elapsedHours });
  const cls = "type-data flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground hover:border-retro-purple/50 hover:text-bone";
  return <nav aria-label="More exploration actions" className="flex gap-1.5">
    <Link href={driveHref(site, t)} className={cls} title={site ? `Explore the surface at ${site.name}` : "Choose a place before exploring the surface"}>
      <Car size={13} />Walk on the Moon
    </Link>
  </nav>;
}

export function FreeplayApp({ aside, guidedPanels, assistantEnabled = true, guidedMode = false }: {
  aside?: ReactNode;
  guidedPanels?: { layers?: { show: boolean; showCatalog?: boolean; layerIds?: LayerId[] }; tourSites?: FreeplaySite[]; dimContent?: boolean };
  assistantEnabled?: boolean;
  guidedMode?: boolean;
}) {
  const view = useFreeplay((s) => s.view);
  const site = useFreeplay((s) => s.site);
  const setView = useFreeplay((s) => s.setView);
  const assistantOpen = useAssistant((s) => s.open);
  const setAssistantOpen = useAssistant((s) => s.setOpen);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const closeAssistant = () => { setAssistantOpen(false); requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus()); };
  const closeExpedition = () => { setExpeditionOpen(false); requestAnimationFrame(() => document.getElementById(EXPEDITION_LAUNCHER_ID)?.focus()); };
  // One side panel at a time keeps the globe usable.
  const toggleExpedition = () => { if (!expeditionOpen) setAssistantOpen(false); setExpeditionOpen(!expeditionOpen); };
  const toggleAssistant = () => { if (!assistantOpen) setExpeditionOpen(false); setAssistantOpen(!assistantOpen); };
  usePlaybackClock();
  // Non-guided Freeplay loads the open expedition (or this browser's draft) and autosaves it.
  // Guided Mission shares the Freeplay store but never attaches, so its resets are never saved.
  useEffect(() => {
    if (guidedMode) return;
    const expeditions = useExpeditions.getState();
    expeditions.attach(new URLSearchParams(window.location.search).get("expedition"));
    return () => { void expeditions.detach(); };
  }, [guidedMode]);

  return <div className="flex h-dvh flex-col bg-void pt-(--nav-height)">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
      <div className="flex items-center gap-3">
        {guidedMode ? <>
          <Link href="/mission" aria-label="Exit Guided Mission" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ArrowLeft size={17} /></Link>
          <div>
            <h1 className="type-heading text-sm text-bone">Guided Mission</h1>
          </div>
        </> : <>
          <h1 className="type-heading text-sm text-bone sm:text-base">Open Exploration</h1>
          <div role="tablist" aria-label="Explore views" className="flex overflow-hidden rounded border border-line">
            {TABS.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`type-data flex items-center gap-1.5 px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] ${view === id ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>
              <Icon size={13} />{label}
            </button>)}
          </div>
          <FreeplayPageLinks />
          {assistantEnabled && <button id={LAUNCHER_ID} type="button" onClick={toggleAssistant} aria-expanded={assistantOpen} aria-controls={PANEL_ID} aria-label={assistantOpen ? "Close mission assistant" : "Open mission assistant"} className={`inline-flex h-8 items-center gap-2 rounded border px-3 type-data text-[0.62rem] uppercase ${assistantOpen ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:border-retro-purple/50 hover:text-bone"}`}>
            <Bot size={14} />Assistant
          </button>}
          <ExpeditionControl open={expeditionOpen} onToggle={toggleExpedition} />
        </>}
      </div>
      {!guidedMode && <div className="type-data min-w-0 truncate text-[0.62rem] text-muted-foreground">
        {site
          ? <><span className="text-bone">{site.name}</span> · {site.latitudeDeg.toFixed(3)}°, {site.longitudeDeg.toFixed(3)}° E · r {site.radiusKm} km</>
          : "Choose a place on the Moon"}
      </div>}
    </header>
    <div className="relative flex min-h-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1">
        {view === "globe" ? <GlobeScreen guidedLayers={guidedPanels?.layers} guidedSites={guidedMode ? guidedPanels?.tourSites : undefined} guidedMode={guidedMode} /> : <OrbitScreen />}
      </div>
      {guidedMode && guidedPanels?.dimContent && <div aria-hidden className="pointer-events-auto absolute inset-0 z-20 bg-void/55 backdrop-blur-[2px]" />}
      {aside}
      {!guidedMode && expeditionOpen && <div className="absolute inset-0 z-40 bg-void/70 p-2 lg:static lg:bg-transparent lg:p-0">
        <ExpeditionPanel onClose={closeExpedition} />
      </div>}
      {assistantEnabled && assistantOpen && <div className="absolute inset-0 z-40 bg-void/70 p-2 lg:static lg:bg-transparent lg:p-0">
        <AssistantPanel onClose={closeAssistant} />
      </div>}
    </div>
  </div>;
}
