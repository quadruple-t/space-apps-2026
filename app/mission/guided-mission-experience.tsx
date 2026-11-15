"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { SurfaceDrive } from "@/app/freeplay/drive/surface-drive";
import { PageIntro } from "@/components/experience/page-intro";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import type { LunarSite } from "@/integrations/science/types";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { GuidedPlanner } from "./guided-planner";
import { GUIDED_LESSONS, GUIDED_START_UTC } from "./tutorial-content";
import { toDriveSite, useTutorialData, withTerrainRecord } from "./use-tutorial-data";

export function GuidedMissionExperience() {
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  const [drive, setDrive] = useState<{ site?: LunarSite; utc: string } | null>(null);
  const tutorial = useTutorialData();
  const returnToStart = () => { setDrive(null); setLessonIndex(null); };

  // Guided Mission runs in Freeplay's own store, so it starts from the opening planner state.
  const start = () => {
    useFreeplay.getState().setStart(GUIDED_START_UTC);
    useFreeplay.setState((state) => ({
      view: "globe", site: null, calloutOpen: false, showCatalog: false,
      layers: { slope: { ...state.layers.slope, on: false }, illumination: { ...state.layers.illumination, on: false }, psr: { ...state.layers.psr, on: false }, elevation: { ...state.layers.elevation, on: false } },
    }));
    setDrive(null);
    setLessonIndex(0);
  };
  // The surface lesson opens at the site and mission time currently selected in the planner.
  const changeLesson = (next: number) => {
    if (next >= GUIDED_LESSONS.length) {
      setDrive(null);
      setLessonIndex(null);
      return;
    }
    if (GUIDED_LESSONS[next].screen !== "drive") { setLessonIndex(next); return; }
    const store = useFreeplay.getState();
    store.setPlaying(false);
    const utc = new Date(currentTimeMs(store)).toISOString();
    const picked = store.site ?? tutorial.tourStops[0];
    if (!picked) { setDrive({ utc }); setLessonIndex(next); return; }
    void withTerrainRecord(toDriveSite(picked, tutorial.catalog)).then((site) => { setDrive({ site, utc }); setLessonIndex(next); });
  };

  if (lessonIndex !== null && GUIDED_LESSONS[lessonIndex]?.screen === "drive") return <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-void">
    <SurfaceDrive guided tutorial={tutorial} startSite={drive?.site} startUtc={drive?.utc} onBack={() => setLessonIndex(lessonIndex - 1)} onGuidedExit={returnToStart} />
  </div>;
  if (lessonIndex !== null) return <GuidedPlanner tutorial={tutorial} lessonIndex={lessonIndex} onLessonChange={changeLesson} onGuidedExit={returnToStart} />;

  return <>
      <PageIntro index="01" title="Guided Mission" lede="Start with Apollo 11 in 1969. Hear the story, see an example, then try each mission decision yourself." status={`${GUIDED_LESSONS.length} short lessons`}>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" disabled={tutorial.status === "loading"} onClick={start}>
            <Play fill="currentColor" />
            {tutorial.status === "loading" ? "Preparing the Moon" : "Begin Guided Mission"}
          </Button>
        </div>
        {tutorial.status === "unavailable" && <p role="status" className="mt-4 text-sm text-retro-red">The site list is unavailable right now. You can still explore a point on the Moon.</p>}
      </PageIntro>

      <section aria-labelledby="first-landing" className="border-b border-line py-12 sm:py-16">
        <PageContainer className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12">
          <p className="type-data text-sm uppercase text-retro-red">Chapter 1 · 1969</p>
          <div className="max-w-3xl">
            <h2 id="first-landing" className="type-heading text-2xl text-bone">Apollo 11: choose a place to land.</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">Begin at Mare Tranquillitatis, then visit historic landing places and future candidate regions. At every stop, the story explains the idea, shows a real example, and gives you one clear thing to try.</p>
          </div>
        </PageContainer>
      </section>
  </>;
}
