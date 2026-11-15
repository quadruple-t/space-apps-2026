"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bot, Car, GitCompareArrows, Globe2, Orbit, Rocket } from "lucide-react";
import { ExpeditionControl, EXPEDITION_LAUNCHER_ID } from "@/components/expeditions/expedition-control";
import { ExpeditionPanel } from "@/components/expeditions/expedition-panel";
import { Logo } from "@/components/brand/logo";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "@/components/freeplay/assistant-panel";
import { LoadingIndicator } from "@/components/freeplay/loading-indicator";
import { usePlaybackClock } from "@/components/freeplay/time-controls";
import type { FreeplaySite } from "@/data/sites";
import { driveHref } from "@/lib/drive-link";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { useAssistant } from "@/lib/assistant/assistant-store";
import { currentTimeMs, useFreeplay, type FreeplayView, type LayerId } from "@/lib/freeplay-store";

const Loading = ({ label }: { label: string }) =>
  <div className="grid h-full place-items-center"><LoadingIndicator label={label} /></div>;

const GlobeScreen = dynamic(() => import("./globe-screen").then((m) => m.GlobeScreen), { ssr: false, loading: () => <Loading label="Moon globe" /> });
const OrbitScreen = dynamic(() => import("./orbit-screen").then((m) => m.OrbitScreen), { ssr: false, loading: () => <Loading label="orbit view" /> });
const LaunchScreen = dynamic(() => import("./launch-screen").then((m) => m.LaunchScreen), { ssr: false, loading: () => <Loading label="launch window" /> });
const CompareScreen = dynamic(() => import("./compare-screen").then((m) => m.CompareScreen), { ssr: false, loading: () => <Loading label="mission comparison" /> });

const TABS: { id: FreeplayView; label: string; Icon: typeof Globe2 }[] = [
  { id: "globe", label: "Moon map", Icon: Globe2 },
  { id: "orbit", label: "Orbit + Graphs", Icon: Orbit },
  { id: "launch", label: "Launch window", Icon: Rocket },
  { id: "compare", label: "Mission comparison", Icon: GitCompareArrows },
];

/** Every item in the top bar is one segment of a single bordered group, divided by a thin line. */
const SEGMENT = "type-data flex items-center gap-1.5 whitespace-nowrap border-l border-line px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] first:border-l-0";
const SEGMENT_IDLE = "text-muted-foreground hover:text-bone";
const SEGMENT_ON = "bg-retro-purple/20 text-bone";

/** Right-hand panel launchers (assistant, expedition) share one look so they read as a pair. */
const TOOL = "inline-flex h-8 items-center gap-2 rounded border px-3 type-data text-[0.62rem] uppercase";
const TOOL_IDLE = "border-line text-muted-foreground hover:border-retro-purple/50 hover:text-bone";
const TOOL_ON = "border-retro-purple/60 bg-retro-purple/15 text-bone";

/** Links to the surface view using the selected place and current mission time. */
function SurfaceLink() {
  const site = useFreeplay((s) => s.site);
  const startIso = useFreeplay((s) => s.startIso);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const setView = useFreeplay((s) => s.setView);
  const t = currentTimeMs({ startIso, elapsedHours });
  // Without a site the drive has nowhere to start, so stay here and show the globe to pick one.
  if (!site) return <button type="button" onClick={() => setView("globe")} className={`${SEGMENT} ${SEGMENT_IDLE}`} title="Choose a place on the globe before exploring the surface">
    <Car size={13} />Walk on the Moon
  </button>;
  return <Link href={driveHref(site, t)} data-accept-site className={`${SEGMENT} ${SEGMENT_IDLE}`} title={`Explore the surface at ${site.name}`}>
    <Car size={13} />Walk on the Moon
  </Link>;
}

export function FreeplayApp({ aside, guidedPanels, assistantEnabled = true, guidedMode = false, onGuidedExit }: {
  aside?: ReactNode;
  guidedPanels?: { layers?: { show: boolean; showCatalog?: boolean; layerIds?: LayerId[] }; tourSites?: FreeplaySite[]; dimContent?: boolean };
  assistantEnabled?: boolean;
  guidedMode?: boolean;
  onGuidedExit?: () => void;
}) {
  const view = useFreeplay((s) => s.view);
  const site = useFreeplay((s) => s.site);
  const setView = useFreeplay((s) => s.setView);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const closeExpedition = () => { setExpeditionOpen(false); requestAnimationFrame(() => document.getElementById(EXPEDITION_LAUNCHER_ID)?.focus()); };
  // The assistant is a right-hand sidebar here (not the floating bubble) and pushes the screen over instead of covering it.
  const assistantOpen = useAssistant((s) => s.open);
  const setAssistantOpen = useAssistant((s) => s.setOpen);
  const closeAssistant = () => { setAssistantOpen(false); requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus()); };
  // One side panel at a time keeps the globe usable.
  const toggleExpedition = () => { if (!expeditionOpen) setAssistantOpen(false); setExpeditionOpen(!expeditionOpen); };
  const toggleAssistant = () => { if (!assistantOpen) setExpeditionOpen(false); setAssistantOpen(!assistantOpen); };
  const sidebarOpen = !guidedMode && assistantOpen;
  usePlaybackClock();
  // Non-guided Open Exploration loads the open expedition (or this browser's draft) and autosaves it.
  // Guided Mission shares the Open Exploration store but never attaches, so its resets are never saved.
  useEffect(() => {
    if (guidedMode) return;
    const expeditions = useExpeditions.getState();
    expeditions.attach(new URLSearchParams(window.location.search).get("expedition"));
    return () => { void expeditions.detach(); };
  }, [guidedMode]);

  return <div className={`flex h-dvh flex-col bg-void ${guidedMode ? "pt-0" : "pt-(--nav-height)"}`}>
    <header className={`flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 sm:px-4 ${guidedMode ? "py-0.5" : "py-2"}`}>
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        {guidedMode ? <>
          {onGuidedExit ? <button type="button" onClick={onGuidedExit} aria-label="Return to Guided Mission start page" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ArrowLeft size={17} /></button>
            : <Link href="/mission" aria-label="Return to Guided Mission start page" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ArrowLeft size={17} /></Link>}
          <Logo compact />
          <div>
            <h1 className="type-heading text-sm text-bone">Guided Mission</h1>
          </div>
        </> : <>
          <h1 className="type-heading text-sm text-bone sm:text-base">Open Exploration</h1>
          <div className="flex max-w-full overflow-x-auto rounded border border-line">
            <div role="tablist" aria-label="Explore views" className="flex">
              {TABS.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={view === id} data-accept-site={id === "orbit" ? "" : undefined} onClick={() => setView(id)}
                className={`${SEGMENT} ${view === id ? SEGMENT_ON : SEGMENT_IDLE}`}>
                <Icon size={13} />{label}
              </button>)}
            </div>
            <SurfaceLink />
          </div>
        </>}
      </div>
      {!guidedMode && <div className="ml-auto flex min-w-0 max-w-full items-center gap-3">
        <div className="type-data min-w-0 truncate text-[0.62rem] text-muted-foreground">
          {site
            ? <><span className="text-bone">{site.name}</span> · {site.latitudeDeg.toFixed(3)}°, {site.longitudeDeg.toFixed(3)}° E · r {site.radiusKm} km</>
            : "Choose a place on the Moon"}
        </div>
        {/* Both side panels dock on the right, so their launchers sit together at the right end, directly above them. */}
        <div role="group" aria-label="Workspace panels" className="flex shrink-0 items-center gap-1.5">
          {assistantEnabled && <button id={LAUNCHER_ID} type="button" onClick={toggleAssistant} aria-expanded={assistantOpen} aria-controls={assistantOpen ? PANEL_ID : undefined} aria-label={assistantOpen ? "Close mission assistant" : "Open mission assistant"}
            className={`${TOOL} ${assistantOpen ? TOOL_ON : TOOL_IDLE}`}>
            <Bot size={14} className="shrink-0" />Assistant
          </button>}
          <ExpeditionControl open={expeditionOpen} onToggle={toggleExpedition} />
        </div>
      </div>}
    </header>
    <div className="relative flex min-h-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1">
        {view === "globe" ? <GlobeScreen guidedLayers={guidedPanels?.layers} guidedSites={guidedMode ? guidedPanels?.tourSites : undefined} guidedMode={guidedMode} />
          : view === "launch" ? <LaunchScreen />
            : view === "compare" ? <CompareScreen /> : <OrbitScreen />}
      </div>
      {guidedMode && guidedPanels?.dimContent && <div aria-hidden className="pointer-events-auto absolute inset-0 z-20 bg-void/55 backdrop-blur-[2px]" />}
      {aside}
      {!guidedMode && <div aria-hidden={!sidebarOpen} inert={!sidebarOpen}
        className={`min-h-0 shrink-0 overflow-hidden bg-void transition-[width] duration-200 ease-out motion-reduce:transition-none max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 ${sidebarOpen ? "w-[min(360px,100vw)] border-l border-line" : "w-0"}`}>
        {sidebarOpen && <div className="h-full w-[min(360px,100vw)]"><AssistantPanel onClose={closeAssistant} /></div>}
      </div>}
      {!guidedMode && expeditionOpen && <div className="absolute inset-0 z-40 bg-void/70 p-2 lg:static lg:bg-transparent lg:p-0">
        <ExpeditionPanel onClose={closeExpedition} />
      </div>}
    </div>
  </div>;
}
