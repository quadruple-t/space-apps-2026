"use client";

import dynamic from "next/dynamic";
import { List } from "lucide-react";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { SiteCallout } from "@/components/freeplay/site-callout";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const MoonGlobe = dynamic(() => import("@/scenes/cesium/moon-globe"), { ssr: false });

export function GlobeScreen() {
  return <div className="flex h-full">
    <div className="relative min-w-0 flex-1" aria-label="Moon Orbit Region: drag to rotate, scroll to zoom, click to pick a site">
      <MoonGlobe />
      <SiteCallout />

      <p className="pointer-events-none absolute left-3 top-3 rounded bg-void/75 px-2 py-1 type-data text-[0.58rem] uppercase tracking-[0.14em] text-bone/70">Moon orbit region · drag to rotate · scroll to zoom · click to pick</p>
      <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-void/75 px-1.5 py-0.5 type-data text-[0.52rem] text-bone/60 md:left-14">Imagery: NASA Moon Trek, LRO WAC · LROC Lunaserv</p>

      <PresetsPanel className="absolute bottom-3 right-3 z-10 hidden max-h-[46%] w-[min(560px,calc(100%-1.5rem))] md:flex" />

      <Sheet>
        <SheetTrigger asChild>
          <button type="button" className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded bg-retro-purple px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void md:hidden"><List size={14} />Presets</button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[70dvh] gap-0 p-0">
          <SheetTitle className="sr-only">Presets</SheetTitle>
          <SheetDescription className="sr-only">Landing sites and your saved sites</SheetDescription>
          <PresetsPanel compact collapsible={false} className="max-h-[70dvh] rounded-none border-0" />
        </SheetContent>
      </Sheet>
    </div>
  </div>;
}
