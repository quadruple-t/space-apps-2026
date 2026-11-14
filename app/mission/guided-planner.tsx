"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FreeplayApp } from "@/app/freeplay/freeplay-app";
import type { FreeplaySite } from "@/data/sites";
import { useFreeplay } from "@/lib/freeplay-store";
import { LAYERS } from "@/scenes/cesium/moon-layers";
import { CHAPTER_LABELS, GUIDED_LESSONS, SCREEN_LABELS } from "./tutorial-content";
import type { TutorialData } from "./use-tutorial-data";

const siteKey = (site: FreeplaySite) => `${site.latitudeDeg},${site.longitudeDeg}`;

/** Interactive science and challenge pages, shown alongside the same tools available in Freeplay. */
export function GuidedPlanner({ tutorial, lessonIndex, onLessonChange }: { tutorial: TutorialData; lessonIndex: number; onLessonChange: (index: number) => void }) {
  const lesson = GUIDED_LESSONS[lessonIndex];
  const view = useFreeplay((s) => s.view);
  const site = useFreeplay((s) => s.site);
  const layers = useFreeplay((s) => s.layers);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const [clockBaseline, setClockBaseline] = useState(elapsedHours);
  const [compared, setCompared] = useState<Set<string>>(() => new Set(site ? [siteKey(site)] : []));
  const [decision, setDecision] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const store = useFreeplay.getState();
    const chapterStart = tutorial.featured[lesson.chapterId]?.[0];
    if (chapterStart) store.selectSite(chapterStart, lesson.screen === "globe");
    store.setView(lesson.screen === "orbit" ? "orbit" : "globe");
    setClockBaseline(store.elapsedHours);
    setCompared(new Set(chapterStart ? [siteKey(chapterStart)] : []));
    setDecision(null);
  // A new chapter begins at its own catalog site; its challenge retains the chosen site afterward.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.chapterId]);

  useEffect(() => useFreeplay.subscribe((state, previous) => {
    const next = state.site;
    if (next && next !== previous.site) setCompared((current) => current.has(siteKey(next)) ? current : new Set(current).add(siteKey(next)));
  }), []);

  const chapter = tutorial.chapters[lesson.chapterId];
  const featured = tutorial.featured[lesson.chapterId] ?? [];
  const overlaysOn = LAYERS.filter((layer) => layers[layer.id].on).map((layer) => layer.label);
  const clockMoved = elapsedHours !== clockBaseline;
  const scienceComplete = lesson.screen === "orbit" ? view === "orbit" && clockMoved : overlaysOn.length > 0 && site !== null;
  const challengeComplete = lesson.id === "apollo-challenge" ? scienceComplete && decision !== null
    : lesson.id === "robot-challenge" ? scienceComplete && decision !== null
    : site !== null && overlaysOn.length > 0 && compared.size >= 2 && decision !== null;
  const complete = lesson.phase === "challenge" ? challengeComplete : scienceComplete;

  const goToLesson = (next: number) => {
    const target = GUIDED_LESSONS[next];
    const store = useFreeplay.getState();
    const chapterStart = target.chapterId !== lesson.chapterId ? tutorial.featured[target.chapterId]?.[0] : undefined;
    if (chapterStart) store.selectSite(chapterStart, target.screen === "globe");
    if (target.screen === "globe") store.setView("globe");
    if (target.screen === "orbit") store.setView("orbit");
    setClockBaseline(store.elapsedHours);
    setDecision(null);
    setCompared(new Set(store.site ? [siteKey(store.site)] : []));
    onLessonChange(next);
  };

  const choices = lesson.id === "apollo-challenge" ? [["low", "Low Sun: terrain relief is visible, but contrast needs careful reading."], ["high", "High Sun: broad illumination, with less surface relief."]]
    : lesson.id === "robot-challenge" ? [["window", "Operate during a period when both Sun and Earth are above the local horizon."], ["dark", "Operate through an extended dark or blocked-contact period."]]
    : [["sunlight", "Prioritize extended sunlight for power."], ["resources", "Prioritize access to nearby permanently shadowed terrain."], ["terrain", "Prioritize terrain suitability and communication geometry."]];

  const aside = <aside aria-live="polite" aria-label="Guided mission page" className="absolute inset-x-2 bottom-2 z-30 max-h-[60%] overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl lg:static lg:max-h-none lg:w-[24rem] lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:border-line lg:shadow-none">
    <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="mb-2 flex w-full items-center justify-between text-xs text-muted-foreground lg:hidden"><span>Guided mission · page {lessonIndex + 1} of {GUIDED_LESSONS.length}</span>{collapsed ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
    <div className={collapsed ? "hidden lg:block" : ""}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-retro-purple">{lesson.kicker}</p><h1 className="mt-2 text-2xl font-medium text-bone">{lesson.title}</h1></div><span className="shrink-0 text-xs text-muted-foreground">{lessonIndex + 1}/{GUIDED_LESSONS.length}</span></div>
      <div className="mt-4 h-px bg-line"><div className="h-px bg-retro-purple" style={{ width: `${((lessonIndex + 1) / GUIDED_LESSONS.length) * 100}%` }}/></div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{lesson.body}</p>
      <div className="mt-4 rounded-lg border border-retro-blue/25 bg-retro-blue/5 p-3"><p className="text-xs font-medium text-retro-blue">Mission objective</p><p className="mt-1 text-sm leading-relaxed text-bone">{lesson.objective}</p>
        {lesson.phase === "science" && <p className="mt-3 text-xs text-muted-foreground">{lesson.screen === "orbit" ? `Timeline moved: ${clockMoved ? "yes" : "not yet"}` : `Active map layers: ${overlaysOn.length ? overlaysOn.join(", ") : "none"}`}</p>}
        {lesson.phase === "challenge" && <div className="mt-3 space-y-2">{choices.map(([value, label]) => <label key={value} className="flex cursor-pointer gap-2 text-xs leading-relaxed text-bone"><input type="radio" name="mission-decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-0.5 accent-retro-purple"/>{label}</label>)}</div>}
        {lesson.id === "base-challenge" && <><label className="mt-3 block text-xs text-muted-foreground">Candidate site<select value={featured.find((candidate) => candidate.id === site?.id)?.id ?? ""} onChange={(event) => { const target = featured.find((candidate) => candidate.id === event.target.value); if (target) useFreeplay.getState().selectSite(target, true); }} className="hud-input mt-1"><option value="">Choose a candidate</option>{featured.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><p className="mt-2 text-xs text-muted-foreground">Sites compared: {compared.size}</p></>}
      </div>
      {lesson.takeaway && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{lesson.takeaway}</p>}
      {chapter && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-xs text-muted-foreground hover:text-bone">Mission record · {chapter.debrief.realMission}</summary><p className="mt-2 text-sm font-medium text-bone">{chapter.debrief.headline}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{chapter.debrief.whatHappened}</p></details>}
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4"><button type="button" onClick={() => goToLesson(lessonIndex - 1)} disabled={lessonIndex === 0} className="text-xs text-muted-foreground disabled:invisible">Previous</button><button type="button" onClick={() => goToLesson(lessonIndex + 1)} disabled={!complete} className="rounded-lg bg-retro-purple px-3 py-2 text-xs font-medium text-void disabled:opacity-40">{complete ? "Continue" : `Use ${SCREEN_LABELS[lesson.screen]}`}</button></div>
    </div>
  </aside>;

  return <FreeplayApp aside={aside} />;
}
