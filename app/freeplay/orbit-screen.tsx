"use client";

import { useMemo } from "react";
import { Globe2, List } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { ConditionsReadout } from "@/components/freeplay/conditions-readout";
import { DailyGraphs, GraphTabs, PanelSettings, YearlyGraphs } from "@/components/freeplay/graphs-panel";
import { OrbitDiagram } from "@/components/freeplay/orbit-diagram";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { TimeControls } from "@/components/freeplay/time-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { earthUp, sampleAt, sunUp } from "@/lib/illumination";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";

function Status({ loading, error, what }: { loading: boolean; error: string | null; what: string }) {
  if (error) return <p role="alert" className="p-3 text-xs text-destructive">Couldn&apos;t load {what}: {error}</p>;
  if (loading) return <p className="type-data animate-pulse p-3 text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Loading {what}…</p>;
  return null;
}

export function OrbitScreen() {
  const site = useFreeplay((s) => s.site);
  const setView = useFreeplay((s) => s.setView);
  if (!site) return <div className="grid h-full place-items-center p-4">
    <div className="hud-panel w-full max-w-md p-5 text-center">
      <Globe2 className="mx-auto text-retro-purple" size={22} aria-hidden />
      <h2 className="type-heading mt-2 text-base text-bone">Pick a site first</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The orbit view and graphs follow one landing site. Click anywhere on the Moon, or choose one of your saved sites.</p>
      <button type="button" onClick={() => setView("globe")} className="mt-4 rounded bg-retro-purple px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void hover:bg-[#c2aaff]">Go to the globe</button>
      <PresetsPanel collapsible={false} className="mt-4 max-h-60 text-left" />
    </div>
  </div>;
  return <OrbitScreenFor key={`${site.catalogId ?? site.id}:${site.latitudeDeg}:${site.longitudeDeg}`} site={site} />;
}

function OrbitScreenFor({ site }: { site: FreeplaySite }) {
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const graphTab = useFreeplay((s) => s.graphTab);
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const tMs = currentTimeMs({ startIso, elapsedHours });
  const startMs = Date.parse(startIso);

  // A day past the mission end so the orbit diagram can draw its motion arrow ahead of the Moon.
  const mission = useLunarWindow(site, startIso, durationHours + 30);
  const year = useLunarWindow(site, startIso, 365 * 24, graphTab === "yearly");
  const missionEndMs = startMs + durationHours * 3_600_000;
  const missionData = mission.data;
  const samples = useMemo(() => missionData?.samples.filter((s) => s.t <= missionEndMs) ?? null, [missionData, missionEndMs]);
  const index = samples?.length ? Math.min(samples.length - 1, elapsedHours) : 0;
  const now = samples?.length ? sampleAt(samples, index) : null;

  return <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto p-2 md:grid-cols-[minmax(0,1fr)_minmax(360px,44%)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(380px,42%)]">
    {/* Left sidebar: graph tabs */}
    <aside className="hud-panel hidden flex-col gap-2 p-3 lg:flex" aria-label="Graphs">
      <h2 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Graphs</h2>
      <GraphTabs vertical />
    </aside>

    {/* Main: orbit diagram */}
    <section className="hud-panel relative h-[52vh] min-h-[300px] overflow-hidden md:h-auto md:min-h-[320px]" aria-label="Orbit diagram">
      {mission.data
        ? <OrbitDiagram series={mission.data.series} site={site} tMs={tMs} missionStartMs={startMs} missionEndMs={missionEndMs}
            sunUp={now ? sunUp(now) : null} earthUp={now ? earthUp(now) : null}
            onSeek={(t) => setElapsed((t - startMs) / 3_600_000)} />
        : <Status loading={mission.loading} error={mission.error} what="Moon and Sun positions" />}
    </section>

    {/* Right column (full height): readouts + graphs, compact presets at the bottom */}
    <div className="flex flex-col gap-2 md:col-start-2 md:row-span-2 md:row-start-1 md:min-h-0 lg:col-start-3">
      <section className="hud-panel flex flex-col gap-2 p-3 md:min-h-0 md:flex-1 md:overflow-y-auto" aria-label="Conditions and graphs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="lg:hidden"><GraphTabs /></div>
          <span className="type-data text-[0.56rem] text-muted-foreground" title="Stored JPL Horizons ephemeris and LOLA horizon masks from the Lunaris360 data API">
            Lunaris360 data · terrain: {mission.data ? (mission.data.horizon.elevationsDeg ? mission.data.horizon.source : "smooth horizon (upper bound)") : "…"}
          </span>
          <PanelSettings />
        </div>
        {now && samples ? <ConditionsReadout samples={samples} index={index} now={now} />
          : <Status loading={mission.loading} error={mission.error} what={`Sun and Earth angles at ${site.name}`} />}
        {graphTab === "daily"
          ? samples && <DailyGraphs samples={samples} siteId={site.id} startMs={startMs} tMs={tMs} />
          : year.data
            ? <YearlyGraphs samples={year.data.samples} siteId={site.id} startMs={startMs} tMs={tMs} missionEndMs={missionEndMs} />
            : <Status loading={year.loading} error={year.error} what="a year of hourly data" />}
      </section>
      <PresetsPanel className="hidden max-h-[28%] shrink-0 md:flex" />
    </div>

    {/* Bottom bar: time controls across sidebar + main */}
    <div className="sticky bottom-0 z-10 bg-void md:static md:col-start-1 md:row-start-2 md:bg-transparent lg:col-span-2"><TimeControls /></div>

    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="flex items-center justify-center gap-1.5 rounded bg-retro-purple px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void md:hidden"><List size={14} />Presets</button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70dvh] gap-0 p-0">
        <SheetTitle className="sr-only">Presets</SheetTitle>
        <SheetDescription className="sr-only">Landing sites and your saved sites</SheetDescription>
        <PresetsPanel collapsible={false} className="max-h-[70dvh] rounded-none border-0" />
      </SheetContent>
    </Sheet>
  </div>;
}
