"use client";

import { List } from "lucide-react";
import { ConditionsReadout } from "@/components/freeplay/conditions-readout";
import { DailyGraphs, GraphTabs, PanelSettings } from "@/components/freeplay/graphs-panel";
import { OrbitDiagram } from "@/components/freeplay/orbit-diagram";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { TimeControls } from "@/components/freeplay/time-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { sampleAt } from "@/lib/illumination";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { useOrbitVectors, useSiteSeries } from "@/lib/use-horizons";

function Status({ loading, error, what }: { loading: boolean; error: string | null; what: string }) {
  if (error) return <p role="alert" className="p-3 text-xs text-destructive">Couldn&apos;t load {what}: {error}</p>;
  if (loading) return <p className="type-data animate-pulse p-3 text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Loading {what} from JPL Horizons…</p>;
  return null;
}

export function OrbitScreen() {
  const site = useFreeplay((s) => s.site);
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const graphTab = useFreeplay((s) => s.graphTab);
  const tMs = currentTimeMs({ startIso, elapsedHours });
  const startMs = Date.parse(startIso);

  const series = useSiteSeries(site.latitudeDeg, site.longitudeDeg, startIso, durationHours);
  const vectors = useOrbitVectors(startIso, durationHours);
  const samples = series.data;
  const index = samples?.length ? Math.min(samples.length - 1, elapsedHours) : 0;
  const now = samples?.length ? sampleAt(samples, index) : null;

  return <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto p-2 md:grid-cols-[minmax(0,1fr)_minmax(360px,44%)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(380px,42%)]">
    {/* Left sidebar: graph tabs */}
    <aside className="hud-panel hidden flex-col gap-2 p-3 lg:flex" aria-label="Graphs">
      <h2 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Graphs</h2>
      <GraphTabs vertical />
    </aside>

    {/* Main: orbit diagram */}
    <section className="hud-panel relative min-h-[320px] overflow-hidden" aria-label="Orbit diagram">
      {vectors.data
        ? <OrbitDiagram vectors={vectors.data} site={site} tMs={tMs} missionStartMs={startMs} missionEndMs={startMs + durationHours * 3_600_000}
            sunUp={now ? now.sunEl > 0 : null} earthUp={now ? now.earthEl > 0 : null} />
        : <Status loading={vectors.loading} error={vectors.error} what="Moon and Sun positions" />}
    </section>

    {/* Right column (full height): readouts + graphs, compact presets at the bottom */}
    <div className="flex min-h-0 flex-col gap-2 md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3">
      <section className="hud-panel flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-label="Conditions and graphs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="lg:hidden"><GraphTabs /></div>
          <span className="type-data text-[0.56rem] text-muted-foreground">JPL Horizons{series.source ? ` · ${series.source}` : ""}</span>
          <PanelSettings />
        </div>
        {now && samples ? <ConditionsReadout samples={samples} index={index} sunEl={now.sunEl} earthEl={now.earthEl} />
          : <Status loading={series.loading} error={series.error} what={`Sun and Earth angles at ${site.name}`} />}
        {graphTab === "daily"
          ? samples && <DailyGraphs samples={samples} siteId={site.id} startMs={startMs} tMs={tMs} />
          : <p className="text-xs text-muted-foreground">Yearly graphs</p>}
      </section>
      <PresetsPanel compact className="hidden max-h-[28%] shrink-0 md:flex" />
    </div>

    {/* Bottom bar: time controls across sidebar + main */}
    <div className="md:col-start-1 md:row-start-2 lg:col-span-2"><TimeControls /></div>

    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="flex items-center justify-center gap-1.5 rounded bg-retro-purple px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void md:hidden"><List size={14} />Presets</button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70dvh] gap-0 p-0">
        <SheetTitle className="sr-only">Presets</SheetTitle>
        <SheetDescription className="sr-only">Landing sites and your saved sites</SheetDescription>
        <PresetsPanel compact collapsible={false} className="max-h-[70dvh] rounded-none border-0" />
      </SheetContent>
    </Sheet>
  </div>;
}
