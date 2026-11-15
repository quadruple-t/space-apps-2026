"use client";

import { useMemo } from "react";
import { List, Rocket } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { DataStatus } from "@/components/freeplay/data-status";
import { OrbitDiagram } from "@/components/freeplay/orbit-diagram";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { TimeControls } from "@/components/freeplay/time-controls";
import { TrajectoryPanel, useTrajectory } from "@/components/freeplay/trajectory-panel";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { earthUp, sampleAt, sunUp } from "@/lib/illumination";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";

export function LaunchScreen() {
  const site = useFreeplay((s) => s.site);
  const setView = useFreeplay((s) => s.setView);
  if (!site) return <div className="grid h-full place-items-center overflow-y-auto p-4">
    <div className="hud-panel w-full max-w-md p-5 text-center">
      <Rocket className="mx-auto text-retro-purple" size={22} aria-hidden />
      <h2 className="type-heading mt-2 text-base text-bone">Pick a landing site first</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The launch window is aimed at one landing site, because the Moon&apos;s position at arrival and the lighting at touchdown depend on where you land. Click anywhere on the Moon, or choose one of your saved sites.</p>
      <button type="button" onClick={() => setView("globe")} className="mt-4 rounded bg-retro-purple px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-void hover:bg-[#c2aaff]">Go to the globe</button>
      <PresetsPanel collapsible={false} className="mt-4 max-h-60 text-left" />
    </div>
  </div>;
  return <LaunchScreenFor site={site} />;
}

function LaunchScreenFor({ site }: { site: FreeplaySite }) {
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const trajectory = useTrajectory(site);
  const tMs = currentTimeMs({ startIso, elapsedHours });
  const startMs = Date.parse(startIso);

  // A day past the mission end so the orbit diagram can draw its motion arrow ahead of the Moon.
  const mission = useLunarWindow(site, startIso, durationHours + 30);
  const missionEndMs = startMs + durationHours * 3_600_000;
  const missionData = mission.data;
  const samples = useMemo(() => missionData?.samples.filter((s) => s.t <= missionEndMs) ?? null, [missionData, missionEndMs]);
  const index = samples?.length ? Math.min(samples.length - 1, elapsedHours) : 0;
  const now = samples?.length ? sampleAt(samples, index) : null;

  return <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto p-2 md:grid-cols-[minmax(0,1fr)_minmax(360px,44%)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden">
    {/* Main: the chosen transfer path drawn on the orbit diagram */}
    <section className="hud-panel relative h-[52vh] min-h-[300px] overflow-hidden md:h-auto md:min-h-[320px]" aria-label="Orbit diagram with launch trajectory">
      {mission.data
        ? <OrbitDiagram series={mission.data.series} site={site} tMs={tMs} missionStartMs={startMs} missionEndMs={missionEndMs}
            sunUp={now ? sunUp(now) : null} earthUp={now ? earthUp(now) : null}
            onSeek={(t) => setElapsed((t - startMs) / 3_600_000)}
            trajectory={trajectory.plan ? { plan: trajectory.plan, artemis: trajectory.artemis } : null} />
        : <DataStatus loading={mission.loading} error={mission.error} what="Moon and Sun positions" />}
    </section>

    {/* Right column: planner inputs and estimates, then compact presets; the column scrolls once on md+ */}
    <div className="flex flex-col gap-2 md:col-start-2 md:row-span-2 md:row-start-1 md:min-h-0 md:overflow-y-auto">
      <TrajectoryPanel state={trajectory} site={site} onSyncTimeline={(plan) => {
        const { setStart, setDuration } = useFreeplay.getState();
        setStart(new Date(plan.launchMs).toISOString());
        setDuration(Math.max(24, Math.ceil(plan.transitSeconds / 3600) + 24));
      }} />
      <PresetsPanel className="hidden max-h-[28%] shrink-0 md:flex" />
    </div>

    {/* Bottom bar: time controls across the diagram */}
    <div className="sticky bottom-0 z-10 bg-void md:static md:col-start-1 md:row-start-2 md:bg-transparent"><TimeControls /></div>

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
