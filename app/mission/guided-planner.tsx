"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FreeplayApp } from "@/app/open-exploration/freeplay-app";
import type { FreeplaySite } from "@/data/sites";
import { useFreeplay, type LayerId } from "@/lib/freeplay-store";
import { LessonCard, lessonActionClass, lessonCheckClass, type LessonStage } from "./lesson-card";
import { COMPARISON_PRESET, GUIDED_LESSONS, STORY_STOPS } from "./tutorial-content";
import { siteForLesson, viewForLesson } from "./lesson-setup";
import { LessonRoadmap } from "./lesson-roadmap";
import type { TutorialData } from "./use-tutorial-data";
import { CandidateComparison } from "./candidate-comparison";
import { SitePreview } from "./site-preview";
import { LessonExampleActivity } from "./lesson-example-activity";

const siteKey = (site: FreeplaySite) => `${site.latitudeDeg},${site.longitudeDeg}`;
const mark = (done: boolean) => (done ? "✓" : "○");

/** A staged Guided Mission lesson beside only the map or chart needed for the current action. */
export function GuidedPlanner({ tutorial, lessonIndex, completedLessons, onLessonComplete, onLessonChange, onGuidedExit }: {
  tutorial: TutorialData;
  lessonIndex: number;
  completedLessons: ReadonlySet<number>;
  onLessonComplete: (index: number) => void;
  onLessonChange: (index: number) => void;
  onGuidedExit: () => void;
}) {
  const lesson = GUIDED_LESSONS[lessonIndex];
  const view = useFreeplay((state) => state.view);
  const site = useFreeplay((state) => state.site);
  const layers = useFreeplay((state) => state.layers);
  const elapsedHours = useFreeplay((state) => state.elapsedHours);
  const [clockBaseline, setClockBaseline] = useState(elapsedHours);
  const [earthAcknowledged, setEarthAcknowledged] = useState(false);
  const [compared, setCompared] = useState<Set<string>>(() => new Set(site ? [siteKey(site)] : []));
  const [collapsed, setCollapsed] = useState(false);
  const [stages, setStages] = useState<Record<number, LessonStage>>({});
  const asideRef = useRef<HTMLElement>(null);
  const stage = stages[lessonIndex] ?? "story";
  const setStage = (nextStage: LessonStage) => setStages((current) => ({ ...current, [lessonIndex]: nextStage }));

  const storySpecForStop = (stop: Partial<FreeplaySite> | null | undefined) => {
    if (!stop) return undefined;
    const id = typeof stop.id === "string" ? stop.id.replace(/^(?:catalog-|approx-|tour-)/, "") : "";
    return STORY_STOPS.find((spec) => Boolean(id && (spec.id === id || spec.catalogId === id))
      || Boolean(stop.catalogId && spec.catalogId === stop.catalogId)
      || Boolean(stop.name && spec.name === stop.name));
  };
  const candidateStops = tutorial.tourStops.filter((stop) => storySpecForStop(stop)?.group === "Artemis III candidate");
  const presetStops = COMPARISON_PRESET.stopIds.flatMap((id) => {
    const spec = STORY_STOPS.find((stop) => stop.id === id);
    const match = spec && tutorial.tourStops.find((stop) => stop.catalogId === spec.catalogId || stop.name === spec.name || stop.id === spec.catalogId);
    return match ? [match] : [];
  });

  useEffect(() => useFreeplay.subscribe((state, previous) => {
    const next = state.site;
    if (next && next !== previous.site) setCompared((current) => current.has(siteKey(next)) ? current : new Set(current).add(siteKey(next)));
  }), []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      asideRef.current?.scrollTo({ top: 0 });
      asideRef.current?.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lessonIndex, stage]);

  const chapter = tutorial.chapters[lesson.chapterId];
  const selectedStoryStop = site && STORY_STOPS.find((stop) =>
    stop.catalogId === site.catalogId || stop.name === site.name || stop.id === site.id.replace(/^(?:catalog-|approx-|tour-)/, ""),
  );
  const clockMoved = elapsedHours !== clockBaseline;
  const complete = lesson.id === "pick-site" ? site !== null
    : lesson.id === "overlays" ? layers.slope.on
    : lesson.id === "sun" ? view === "orbit" && clockMoved
    : lesson.id === "earth" ? earthAcknowledged
    : lesson.id === "candidates" ? site !== null && compared.size >= 2
    : ["look", "move", "camera", "horizon"].every(() => false);

  // Next, Back and the roadmap all arrive here, so a skipped lesson opens with the site, view and
  // fresh task state it would have had when reached in order. The drive is prepared by the parent.
  const goToLesson = (next: number) => {
    if (next >= GUIDED_LESSONS.length) {
      onLessonChange(next);
      return;
    }
    const target = GUIDED_LESSONS[next];
    const store = useFreeplay.getState();
    if (target.screen !== "drive") {
      const chapterStart = siteForLesson({ target, fromChapter: lesson.chapterId, currentSite: store.site, tourStops: tutorial.tourStops, candidateStops });
      if (chapterStart) store.selectSite(chapterStart, false);
      store.setView(viewForLesson(target));
      const current = chapterStart ?? store.site;
      setCompared(new Set(current ? [siteKey(current)] : []));
      setClockBaseline(store.elapsedHours);
      setEarthAcknowledged(false);
      setStages((currentStages) => ({ ...currentStages, [next]: "story" }));
    }
    onLessonChange(next);
  };

  const previous = () => {
    if (stage === "try") setStage("example");
    else if (stage === "example") setStage("story");
    else if (lessonIndex > 0) goToLesson(lessonIndex - 1);
    else onLessonChange(-1);
  };

  const siteForStop = (id: string) => tutorial.tourStops.find((stop) => Boolean(stop && (stop.id === id || stop.catalogId === id)));
  const aside = <aside ref={asideRef} aria-live="polite" aria-label="Guided Mission lesson" className={`absolute inset-x-2 bottom-2 z-30 overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl ${stage === "try" ? "max-h-[90%]" : "max-h-[68%]"} lg:static lg:max-h-none lg:w-[23rem] lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:border-line lg:shadow-none`}>
    <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand lesson" : "Collapse lesson"} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone lg:hidden">
      {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
    <div className={collapsed ? "hidden lg:block" : ""}>
      <LessonCard lesson={lesson} chapter={chapter} missionStory={selectedStoryStop && site ? { title: selectedStoryStop.name, body: selectedStoryStop.note } : null} stage={stage} complete={complete} onPrevious={stage !== "story" || lessonIndex > 0 ? previous : undefined} onStageChange={setStage} onNext={() => { onLessonComplete(lessonIndex); goToLesson(lessonIndex + 1); }} nextLabel={lessonIndex === GUIDED_LESSONS.length - 1 ? "Finish Guided Mission" : "Next lesson"} exampleContent={<LessonExampleActivity lesson={lesson} stops={tutorial.tourStops} candidates={presetStops} />}>
        {stage === "try" && lesson.id === "pick-site" && <>
          <label className="sr-only" htmlFor="story-site-stop">Choose a stop</label>
          <select id="story-site-stop" value={site?.id ?? ""} onChange={(event) => { const selected = siteForStop(event.target.value); if (selected) useFreeplay.getState().selectSite(selected, false); }} className="hud-input mt-1 text-sm normal-case tracking-normal">
            <option value="">Choose from the ten highlighted stops</option>
            {tutorial.tourStops.filter((stop): stop is FreeplaySite => Boolean(stop && typeof stop.id === "string" && typeof stop.name === "string")).map((stop, index) => {
              const spec = storySpecForStop(stop);
              const group = spec?.group === "Historic landing" ? "historic" : spec?.group === "Artemis III candidate" ? "future candidate" : "no past landing";
              return <option key={stop.id} value={stop.id}>{index + 1}. {stop.name} · {group}</option>;
            })}
          </select>
          <p className={lessonCheckClass}>{site ? `Selected: ${site.name}` : "Or click a marker on the Moon."}</p>
          {site && <div className="mt-2 overflow-hidden border border-retro-purple/35"><SitePreview site={site} /></div>}
        </>}
        {stage === "try" && lesson.id === "overlays" && <p className={lessonCheckClass}>Slope layer {mark(layers.slope.on)}</p>}
        {stage === "try" && lesson.id === "sun" && <p className={lessonCheckClass}>Mission time moved {mark(view === "orbit" && clockMoved)}</p>}
        {stage === "try" && lesson.id === "earth" && <button type="button" onClick={() => setEarthAcknowledged(true)} className={lessonActionClass}>{earthAcknowledged ? "Readout found ✓" : "I found the Earth visibility readout"}</button>}
        {stage === "try" && lesson.id === "candidates" && <>
          <CandidateComparison sites={tutorial.tourStops} />
          <p className={lessonCheckClass}>Compare two stops from the site picker in lesson 1. Select a card to inspect that place in the orbit view. Places visited: {compared.size}</p>
        </>}
      </LessonCard>
    </div>
  </aside>;

  const guidedPanels = {
    layers: { show: stage === "try" && lesson.id === "overlays", showCatalog: false, layerIds: lesson.id === "overlays" ? ["slope"] as LayerId[] : [] },
    tourSites: tutorial.tourStops,
  };

  // FreeplayApp sizes itself to the viewport; inside the tutorial it fills the space above the roadmap instead.
  return <div className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-void">
    <div className="relative min-h-0 flex-1 [&>div]:h-full">
      <FreeplayApp aside={aside} guidedPanels={guidedPanels} assistantEnabled={false} guidedMode onGuidedExit={onGuidedExit} />
    </div>
    <LessonRoadmap current={lessonIndex} completed={completedLessons} onSelect={goToLesson} />
  </div>;
}
