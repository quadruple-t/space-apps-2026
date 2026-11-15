"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FreeplayApp } from "@/app/freeplay/freeplay-app";
import type { FreeplaySite } from "@/data/sites";
import { useFreeplay, type LayerId } from "@/lib/freeplay-store";
import { LessonCard, lessonActionClass, lessonCheckClass, type LessonStage } from "./lesson-card";
import { GUIDED_LESSONS, STORY_STOPS } from "./tutorial-content";
import type { TutorialData } from "./use-tutorial-data";

const siteKey = (site: FreeplaySite) => `${site.latitudeDeg},${site.longitudeDeg}`;
const mark = (done: boolean) => (done ? "✓" : "○");

/** A staged Guided Mission lesson beside only the map or chart needed for the current action. */
export function GuidedPlanner({ tutorial, lessonIndex, onLessonChange }: {
  tutorial: TutorialData;
  lessonIndex: number;
  onLessonChange: (index: number) => void;
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

  const candidateStops = tutorial.tourStops.filter((stop) => STORY_STOPS.find((spec) => spec.id === stop.id)?.group === "Artemis III candidate");

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
  const clockMoved = elapsedHours !== clockBaseline;
  const complete = lesson.id === "pick-site" ? site !== null
    : lesson.id === "overlays" ? layers.slope.on
    : lesson.id === "sun" ? view === "orbit" && clockMoved
    : lesson.id === "earth" ? earthAcknowledged
    : lesson.id === "candidates" ? site !== null && compared.size >= 2
    : ["look", "move", "camera", "horizon"].every(() => false);

  const goToLesson = (next: number) => {
    if (next >= GUIDED_LESSONS.length) {
      onLessonChange(next);
      return;
    }
    const target = GUIDED_LESSONS[next];
    const store = useFreeplay.getState();
    if (target.screen !== "drive") {
      const chapterStart = target.chapterId !== lesson.chapterId
        ? target.chapterId === "ch3-lunar-base" ? candidateStops[0] : tutorial.tourStops[0]
        : undefined;
      if (chapterStart) store.selectSite(chapterStart, false);
      store.setView(target.screen === "orbit" ? "orbit" : "globe");
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
  };

  const siteForStop = (id: string) => tutorial.tourStops.find((stop) => stop.id === id || stop.catalogId === id);
  const aside = <aside ref={asideRef} aria-live="polite" aria-label="Guided Mission lesson" className={`absolute inset-x-2 bottom-2 z-30 overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl ${stage === "try" ? "max-h-[90%]" : "max-h-[68%]"} lg:static lg:max-h-none lg:w-[23rem] lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:border-line lg:shadow-none`}>
    <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand lesson" : "Collapse lesson"} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone lg:hidden">
      {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
    <div className={collapsed ? "hidden lg:block" : ""}>
      <LessonCard lesson={lesson} chapter={chapter} stage={stage} complete={complete} onPrevious={stage !== "story" || lessonIndex > 0 ? previous : undefined} onStageChange={setStage} onNext={() => goToLesson(lessonIndex + 1)} nextLabel={lessonIndex === GUIDED_LESSONS.length - 1 ? "Finish Guided Mission" : "Next lesson"}>
        {stage === "try" && lesson.id === "pick-site" && <>
          <label className="sr-only" htmlFor="story-site-stop">Choose a stop</label>
          <select id="story-site-stop" value={site?.id ?? ""} onChange={(event) => { const selected = siteForStop(event.target.value); if (selected) useFreeplay.getState().selectSite(selected, false); }} className="hud-input mt-1 text-sm normal-case tracking-normal">
            <option value="">Choose from the ten highlighted stops</option>
            {tutorial.tourStops.map((stop, index) => {
              const spec = STORY_STOPS.find((candidate) => candidate.id === stop.id);
              const group = spec?.group === "Historic landing" ? "historic" : spec?.group === "Artemis III candidate" ? "future candidate" : "no past landing";
              return <option key={stop.id} value={stop.id}>{index + 1}. {stop.name} · {group}</option>;
            })}
          </select>
          <p className={lessonCheckClass}>{site ? `Selected: ${site.name}` : "Or click a marker on the Moon."}</p>
        </>}
        {stage === "try" && lesson.id === "overlays" && <p className={lessonCheckClass}>Slope layer {mark(layers.slope.on)}</p>}
        {stage === "try" && lesson.id === "sun" && <p className={lessonCheckClass}>Mission time moved {mark(view === "orbit" && clockMoved)}</p>}
        {stage === "try" && lesson.id === "earth" && <button type="button" onClick={() => setEarthAcknowledged(true)} className={lessonActionClass}>{earthAcknowledged ? "Readout found ✓" : "I found the Earth visibility readout"}</button>}
        {stage === "try" && lesson.id === "candidates" && <>
          <label className="mt-3 block text-sm text-bone">Compare candidate sites
            <select value={candidateStops.find((candidate) => candidate.id === site?.id)?.id ?? ""} onChange={(event) => { const selected = candidateStops.find((candidate) => candidate.id === event.target.value); if (selected) useFreeplay.getState().selectSite(selected, false); }} className="hud-input mt-2 text-sm normal-case tracking-normal">
              <option value="">Choose a candidate</option>
              {candidateStops.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
          <p className={lessonCheckClass}>Places compared: {compared.size}</p>
        </>}
      </LessonCard>
    </div>
  </aside>;

  const guidedPanels = {
    layers: { show: stage === "try" && lesson.id === "overlays", showCatalog: false, layerIds: lesson.id === "overlays" ? ["slope"] as LayerId[] : [] },
    tourSites: tutorial.tourStops,
    dimContent: stage !== "try" && lesson.id !== "pick-site",
  };

  return <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-void">
    <FreeplayApp aside={aside} guidedPanels={guidedPanels} assistantEnabled={false} guidedMode />
  </div>;
}
