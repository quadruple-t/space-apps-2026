"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { SurfaceDrive } from "@/app/open-exploration/drive/surface-drive";
import { Logo } from "@/components/brand/logo";
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
  // Lessons finished with "Next lesson"; lessons skipped from the roadmap stay unmarked.
  const [completedLessons, setCompletedLessons] = useState<ReadonlySet<number>>(() => new Set());
  const completeLesson = (index: number) => setCompletedLessons((current) => current.has(index) ? current : new Set(current).add(index));
  const tutorial = useTutorialData();
  // Opening the drive waits for the site's terrain record; a later lesson change cancels it.
  const lessonRequest = useRef(0);
  const returnToStart = () => { lessonRequest.current++; setDrive(null); setLessonIndex(null); };

  // Guided Mission runs in Open Exploration's own store, so it starts from the opening planner state.
  const start = () => {
    useFreeplay.getState().setStart(GUIDED_START_UTC);
    useFreeplay.setState((state) => ({
      view: "globe", site: null, calloutOpen: false, showCatalog: false,
      layers: Object.fromEntries(Object.entries(state.layers).map(([id, layer]) => [id, { ...layer, on: false }])) as typeof state.layers,
    }));
    setDrive(null);
    setCompletedLessons(new Set());
    setLessonIndex(0);
  };
  // The surface lesson opens at the site and mission time currently selected in the planner.
  const changeLesson = (next: number) => {
    const request = ++lessonRequest.current;
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
    void withTerrainRecord(toDriveSite(picked, tutorial.catalog)).then((site) => {
      if (request !== lessonRequest.current) return;
      setDrive({ site, utc });
      setLessonIndex(next);
    });
  };

  if (lessonIndex !== null && GUIDED_LESSONS[lessonIndex]?.screen === "drive") return <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-void">
    <SurfaceDrive guided tutorial={tutorial} startSite={drive?.site} startUtc={drive?.utc} onBack={() => setLessonIndex(lessonIndex - 1)} onGuidedExit={returnToStart} />
  </div>;
  if (lessonIndex !== null) return <GuidedPlanner tutorial={tutorial} lessonIndex={lessonIndex} completedLessons={completedLessons} onLessonComplete={completeLesson} onLessonChange={changeLesson} onGuidedExit={returnToStart} />;

  return <>
      <PageIntro beforeTitle={<Logo compact />} index="01" title="Guided Mission" lede="Start with Apollo 11 in 1969. Hear the story, see an example, then try each mission decision yourself." status={`${GUIDED_LESSONS.length} short lessons`}>
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
