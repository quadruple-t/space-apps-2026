"use client";

import { useMemo, useState } from "react";
import { BatteryCharging, Globe2, Sun } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { ConditionsReadout } from "@/components/freeplay/conditions-readout";
import { DailyGraphs, GraphTabs, PanelSettings, YearlyGraphs, type GraphFocus } from "@/components/freeplay/graphs-panel";
import { OrbitDiagram } from "@/components/freeplay/orbit-diagram";
import { PresetsPanel } from "@/components/freeplay/presets-panel";
import { TrajectoryPanel, useTrajectory } from "@/components/freeplay/trajectory-panel";
import { TimeControls } from "@/components/freeplay/time-controls";
import { earthUp, sampleAt, sunUp } from "@/lib/illumination";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";

function Status({ loading, error, what }: { loading: boolean; error: string | null; what: string }) {
  if (error) return <p role="alert" className="p-3 text-xs text-destructive">Couldn&apos;t load {what}: {error}</p>;
  if (loading) return <p className="type-data animate-pulse p-3 text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Loading {what}…</p>;
  return null;
}

export function OrbitScreen() {
  const site = useFreeplay((state) => state.site);
  const setView = useFreeplay((state) => state.setView);
  if (!site) return <div className="grid h-full place-items-center p-4">
    <div className="hud-panel w-full max-w-md p-5 text-center">
      <Globe2 className="mx-auto text-retro-purple" size={22} aria-hidden />
      <h2 className="type-heading mt-2 text-base text-bone">Choose a place first</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Choose a place on the Moon map to see how sunlight and Earth visibility change there.</p>
      <button type="button" onClick={() => setView("globe")} className="mt-4 rounded bg-retro-purple px-4 py-2 text-sm font-semibold text-void hover:bg-[#c2aaff]">Open Moon map</button>
      <PresetsPanel collapsible={false} className="mt-4 max-h-60 text-left" />
    </div>
  </div>;
  return <OrbitScreenFor site={site} />;
}

function OrbitScreenFor({ site }: { site: FreeplaySite }) {
  const startIso = useFreeplay((state) => state.startIso);
  const durationHours = useFreeplay((state) => state.durationHours);
  const elapsedHours = useFreeplay((state) => state.elapsedHours);
  const graphTab = useFreeplay((state) => state.graphTab);
  const setElapsed = useFreeplay((state) => state.setElapsed);
  const trajectory = useTrajectory(site);
  const [focus, setFocus] = useState<GraphFocus>("sunlight");
  const tMs = currentTimeMs({ startIso, elapsedHours });
  const startMs = Date.parse(startIso);
  const mission = useLunarWindow(site, startIso, durationHours + 30);
  const year = useLunarWindow(site, startIso, 365 * 24, graphTab === "yearly");
  const missionEndMs = startMs + durationHours * 3_600_000;
  const samples = useMemo(() => mission.data?.samples.filter((sample) => sample.t <= missionEndMs) ?? null, [mission.data, missionEndMs]);
  const index = samples?.length ? Math.min(samples.length - 1, elapsedHours) : 0;
  const now = samples?.length ? sampleAt(samples, index) : null;
  const activeFocus = graphTab === "yearly" && focus === "power" ? "sunlight" : focus;
  const topics: { id: GraphFocus; label: string; Icon: typeof Sun }[] = [
    { id: "sunlight", label: "Sunlight", Icon: Sun },
    { id: "earth", label: "Earth visibility", Icon: Globe2 },
    ...(graphTab === "daily" ? [{ id: "power" as const, label: "Solar power", Icon: BatteryCharging }] : []),
  ];

  return <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <section className="hud-panel p-4 sm:p-5" aria-label="Explore mission conditions">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="type-heading text-lg text-bone">Explore this site over time</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a question, then click the graph to move through the mission.</p>
          </div>
          <GraphTabs />
        </div>

        <div role="group" aria-label="Choose what to explore" className="mt-4 flex flex-wrap gap-2">
          {topics.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={activeFocus === id} onClick={() => setFocus(id)} className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${activeFocus === id ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:text-bone"}`}>
            <Icon size={16} />{label}
          </button>)}
          {activeFocus === "power" && <PanelSettings />}
        </div>

        <div className="mt-4 border-t border-line/80 pt-4">
          {now && samples ? <ConditionsReadout samples={samples} index={index} now={now} focus={activeFocus} />
            : <Status loading={mission.loading} error={mission.error} what={`Sun and Earth positions at ${site.name}`} />}
          {graphTab === "daily"
            ? samples && <DailyGraphs samples={samples} siteId={site.id} startMs={startMs} tMs={tMs} focus={activeFocus} />
            : year.data
              ? <YearlyGraphs samples={year.data.samples} siteId={site.id} startMs={startMs} tMs={tMs} missionEndMs={missionEndMs} focus={activeFocus === "earth" ? "earth" : "sunlight"} />
              : <Status loading={year.loading} error={year.error} what="yearly conditions" />}
          <p className="mt-3 text-sm text-muted-foreground">Click a point on the graph to see the conditions at that time.</p>
        </div>
      </section>

      <details className="hud-panel p-4" open>
        <summary className="cursor-pointer type-heading text-base text-bone">How do the Moon and Earth move?</summary>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">This diagram shows their changing positions from above. It is not to scale.</p>
        <div className="mt-3 h-[min(48dvh,420px)] min-h-64">
          {mission.data
            ? <OrbitDiagram series={mission.data.series} site={site} tMs={tMs} missionStartMs={startMs} missionEndMs={missionEndMs}
                sunUp={now ? sunUp(now) : null} earthUp={now ? earthUp(now) : null}
                onSeek={(time) => setElapsed((time - startMs) / 3_600_000)}
                trajectory={trajectory.plan ? { plan: trajectory.plan, artemis: trajectory.artemis } : null} />
            : <Status loading={mission.loading} error={mission.error} what="orbit positions" />}
        </div>
      </details>

      <TrajectoryPanel state={trajectory} site={site} onSyncTimeline={(plan) => {
        const { setStart, setDuration } = useFreeplay.getState();
        setStart(new Date(plan.launchMs).toISOString());
        setDuration(Math.max(24, Math.ceil(plan.transitSeconds / 3600) + 24));
      }} />

      <TimeControls />
    </div>
  </div>;
}
