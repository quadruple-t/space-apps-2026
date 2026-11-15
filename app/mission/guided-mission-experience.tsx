"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { SurfaceDrive } from "@/app/freeplay/drive/surface-drive";
import { PageIntro } from "@/components/experience/page-intro";
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

  // Guided Mission runs in Freeplay's own store, so it starts from the opening planner state.
  const start = () => {
    useFreeplay.getState().setStart(GUIDED_START_UTC);
    useFreeplay.setState((state) => ({
      view: "globe", site: null, calloutOpen: false, showCatalog: false,
      layers: Object.fromEntries(Object.entries(state.layers).map(([id, layer]) => [id, { ...layer, on: false }])) as typeof state.layers,
    }));
    setDrive(null);
    setLessonIndex(0);
  };
  // The surface lesson opens at the site and mission time currently selected in the planner.
  const changeLesson = (next: number) => {
    if (next < 0) {
      setDrive(null);
      setLessonIndex(null);
      return;
    }
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
    <SurfaceDrive guided tutorial={tutorial} startSite={drive?.site} startUtc={drive?.utc} onBack={() => setLessonIndex(lessonIndex - 1)} />
  </div>;
  if (lessonIndex !== null) return <GuidedPlanner tutorial={tutorial} lessonIndex={lessonIndex} onLessonChange={changeLesson} />;

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

  </>;
}
