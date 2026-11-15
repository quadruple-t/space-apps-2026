"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Bot, Car, GitCompareArrows, Globe2, Orbit } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "@/components/freeplay/assistant-panel";
import { usePlaybackClock } from "@/components/freeplay/time-controls";
import type { FreeplaySite } from "@/data/sites";
import { useAssistant } from "@/lib/assistant/assistant-store";
import { driveHref } from "@/lib/drive-link";
import { currentTimeMs, useFreeplay, type FreeplayView, type LayerId } from "@/lib/freeplay-store";

const Loading = ({ label }: { label: string }) =>
  <div className="grid h-full place-items-center"><span className="type-data animate-pulse text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Loading {label}…</span></div>;

const GlobeScreen = dynamic(() => import("./globe-screen").then((m) => m.GlobeScreen), { ssr: false, loading: () => <Loading label="Moon globe" /> });
const OrbitScreen = dynamic(() => import("./orbit-screen").then((m) => m.OrbitScreen), { ssr: false, loading: () => <Loading label="orbit view" /> });
const CompareScreen = dynamic(() => import("./compare-screen").then((m) => m.CompareScreen), { ssr: false, loading: () => <Loading label="mission comparison" /> });

const TABS: { id: FreeplayView; label: string; Icon: typeof Globe2 }[] = [
  { id: "globe", label: "Moon map", Icon: Globe2 },
  { id: "orbit", label: "Orbit + Graphs", Icon: Orbit },
  { id: "compare", label: "Mission comparison", Icon: GitCompareArrows },
];

/** Every item in the top bar is one segment of a single bordered group, divided by a thin line. */
const SEGMENT = "type-data flex items-center gap-1.5 whitespace-nowrap border-l border-line px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] first:border-l-0";
const SEGMENT_IDLE = "text-muted-foreground hover:text-bone";
const SEGMENT_ON = "bg-retro-purple/20 text-bone";

/** Links to the surface view using the selected place and current mission time. */
function SurfaceLink() {
  const site = useFreeplay((s) => s.site);
  const startIso = useFreeplay((s) => s.startIso);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const t = currentTimeMs({ startIso, elapsedHours });
  return <Link href={driveHref(site, t)} className={`${SEGMENT} ${SEGMENT_IDLE}`} title={site ? `Explore the surface at ${site.name}` : "Choose a place before exploring the surface"}>
    <Car size={13} />Walk on the Moon
  </Link>;
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
  const hydrate = useFreeplay((s) => s.hydrate);
  const assistantOpen = useAssistant((s) => s.open);
  const setAssistantOpen = useAssistant((s) => s.setOpen);
  const closeAssistant = () => { setAssistantOpen(false); requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus()); };
  usePlaybackClock();
  useEffect(() => { hydrate(); }, [hydrate]);

  return <div className={`flex h-dvh flex-col bg-void ${guidedMode ? "pt-0" : "pt-(--nav-height)"}`}>
    <header className={`flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 sm:px-4 ${guidedMode ? "py-0.5" : "py-2"}`}>
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        {guidedMode ? <>
          <Link href="/" aria-label="Exit Guided Mission to Lunaris360 home" className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><ArrowLeft size={16} /></Link>
          <Logo compact />
          <h1 className="type-heading text-sm text-bone">Guided Mission</h1>
        </> : <>
          <h1 className="type-heading text-sm text-bone sm:text-base">Open Exploration</h1>
          <div className="flex max-w-full overflow-x-auto rounded border border-line">
            <div role="tablist" aria-label="Explore views" className="flex">
              {TABS.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`${SEGMENT} ${view === id ? SEGMENT_ON : SEGMENT_IDLE}`}>
                <Icon size={13} />{label}
              </button>)}
            </div>
            <SurfaceLink />
            {assistantEnabled && <button id={LAUNCHER_ID} type="button" onClick={() => setAssistantOpen(!assistantOpen)} aria-expanded={assistantOpen} aria-controls={PANEL_ID} aria-label={assistantOpen ? "Close mission assistant" : "Open mission assistant"}
              className={`${SEGMENT} ${assistantOpen ? SEGMENT_ON : SEGMENT_IDLE}`}>
              <Bot size={14} />Assistant
            </button>}
          </div>
        </>}
      </div>
      {!guidedMode && <div className="type-data min-w-0 truncate text-[0.62rem] text-muted-foreground">
        {site ? <><span className="text-bone">{site.name}</span></> : "No site selected"}
      </div>}
    </header>
    <div className="relative flex min-h-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1">
        {view === "globe" ? <GlobeScreen guidedLayers={guidedPanels?.layers} guidedSites={guidedMode ? guidedPanels?.tourSites : undefined} guidedMode={guidedMode} />
          : view === "compare" ? <CompareScreen /> : <OrbitScreen />}
      </div>
      {guidedMode && guidedPanels?.dimContent && <div aria-hidden className="pointer-events-auto absolute inset-0 z-20 bg-void/55 backdrop-blur-[2px]" />}
      {aside}
      {assistantEnabled && assistantOpen && <div className="absolute inset-0 z-40 bg-void/70 p-2 lg:static lg:bg-transparent lg:p-0">
        <AssistantPanel onClose={closeAssistant} />
      </div>}
    </div>
  </div>;
}
