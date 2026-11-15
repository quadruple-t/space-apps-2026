"use client";

import dynamic from "next/dynamic";
import { Layers, List } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { LayersPanel } from "@/components/freeplay/layers-panel";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { SiteCallout } from "@/components/freeplay/site-callout";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { LayerId } from "@/lib/freeplay-store";

const MoonGlobe = dynamic(() => import("@/scenes/cesium/moon-globe"), { ssr: false });

export function GlobeScreen({ guidedLayers, guidedSites, guidedMode = false }: { guidedLayers?: { show: boolean; showCatalog?: boolean; layerIds?: LayerId[] }; guidedSites?: FreeplaySite[]; guidedMode?: boolean }) {
  const showLayers = guidedLayers?.show ?? true;
  const layerProps = guidedLayers ? { showBaseImagery: false, showCatalog: guidedLayers.showCatalog ?? false, layerIds: guidedLayers.layerIds ?? [] } : {};
  return <div className="flex h-full">
    {showLayers && <aside className="hidden w-60 shrink-0 border-r border-line bg-void/60 md:flex" aria-label="Layers sidebar">
      <LayersPanel className="w-full" {...layerProps} />
    </aside>}

    <div className="relative min-w-0 flex-1" aria-label="Moon Orbit Region: drag to rotate, scroll to zoom, click to pick a site">
      <MoonGlobe guidedSites={guidedSites} />
      <SiteCallout guided={guidedMode} />

      {!guidedMode && <>
        <p className="pointer-events-none absolute left-3 top-3 hidden rounded bg-void/75 px-2 py-1 type-data text-[0.58rem] uppercase tracking-[0.14em] text-bone/70 md:block">Moon orbit region · drag to rotate · scroll to zoom · click to pick</p>
        <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-void/75 px-1.5 py-0.5 type-data text-[0.52rem] text-bone/60 md:left-14">Imagery: NASA Moon Trek, LRO WAC · LROC Lunaserv</p>
      </>}

      {!guidedMode && <PresetsPanel className="absolute bottom-3 right-3 z-10 hidden max-h-[46%] w-[min(560px,calc(100%-1.5rem))] md:flex" />}

      {/* Narrow screens: layers drawer + presets bottom sheet */}
      {showLayers && <Sheet>
        <SheetTrigger asChild>
          <button type="button" className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded border border-line bg-void/85 px-3 py-2 text-[0.62rem] uppercase tracking-[0.1em] text-bone md:hidden"><Layers size={14} />Layers</button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 p-0">
          <SheetTitle className="sr-only">Layers</SheetTitle>
          <SheetDescription className="sr-only">Map overlays</SheetDescription>
          <LayersPanel {...layerProps} />
        </SheetContent>
      </Sheet>}
      {!guidedMode && <Sheet>
        <SheetTrigger asChild>
          <button type="button" className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded bg-retro-purple px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void md:hidden"><List size={14} />Presets</button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[70dvh] gap-0 p-0">
          <SheetTitle className="sr-only">Presets</SheetTitle>
          <SheetDescription className="sr-only">Landing sites and your saved sites</SheetDescription>
          <PresetsPanel collapsible={false} className="max-h-[70dvh] rounded-none border-0" />
        </SheetContent>
      </Sheet>}
    </div>
  </div>;
}
