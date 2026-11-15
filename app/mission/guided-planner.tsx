"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FreeplayApp } from "@/app/freeplay/freeplay-app";
import type { FreeplaySite } from "@/data/sites";
import { useFreeplay } from "@/lib/freeplay-store";
import { LAYERS } from "@/scenes/cesium/moon-layers";
import { LessonCard, lessonActionClass, lessonCheckClass } from "./lesson-card";
import { CHAPTER_LABELS, GUIDED_LESSONS, SCREEN_LABELS } from "./tutorial-content";
import { SitePreview } from "./site-preview";
import type { TutorialData } from "./use-tutorial-data";

const siteKey = (site: FreeplaySite) => `${site.latitudeDeg},${site.longitudeDeg}`;
const mark = (done: boolean) => (done ? "✓" : "○");

/** Freeplay's Globe and Orbit + Graphs screens with the tutorial lesson docked beside them. */
export function GuidedPlanner({ tutorial, lessonIndex, onLessonChange, candidatesCompared }: {
  tutorial: TutorialData;
  lessonIndex: number;
  /** Called with the next lesson index; the parent switches to the surface drive when that lesson runs there. */
  onLessonChange: (index: number) => void;
  /** True when returning from the surface drive, so the comparison lesson stays complete. */
  candidatesCompared: boolean;
}) {
  const lesson = GUIDED_LESSONS[lessonIndex];
  const view = useFreeplay((s) => s.view);
  const site = useFreeplay((s) => s.site);
  const layers = useFreeplay((s) => s.layers);
  const showCatalog = useFreeplay((s) => s.showCatalog);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const [clockBaseline, setClockBaseline] = useState(elapsedHours);
  const [earthAcknowledged, setEarthAcknowledged] = useState(false);
  const [compared, setCompared] = useState<Set<string>>(() => new Set(site ? [siteKey(site)] : []));
  const [comparisonSites, setComparisonSites] = useState<FreeplaySite[]>(() => site ? [site] : []);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => useFreeplay.subscribe((state, previous) => {
    const next = state.site;
    if (next && next !== previous.site) {
      const key = siteKey(next);
      setCompared((current) => current.has(key) ? current : new Set(current).add(key));
      setComparisonSites((current) => [...current.filter((item) => siteKey(item) !== key), next].slice(-2));
    }
  }), []);

  const chapter = tutorial.chapters[lesson.chapterId];
  const featured = tutorial.featured[lesson.chapterId] ?? [];
  const overlaysOn = LAYERS.filter((layer) => layers[layer.id].on).map((layer) => layer.label);
  const clockMoved = elapsedHours !== clockBaseline;
  const complete = lesson.id === "pick-site" ? site !== null
    : lesson.id === "overlays" ? overlaysOn.length > 0
    : lesson.id === "sun" ? view === "orbit" && clockMoved
    : lesson.id === "earth" ? earthAcknowledged
    : site !== null && (candidatesCompared || compared.size >= 2);

  const goToLesson = (next: number) => {
    const target = GUIDED_LESSONS[next];
    const store = useFreeplay.getState();
    if (target.screen !== "drive") {
      // Each story chapter opens at its first featured catalog site.
      const chapterStart = target.chapterId !== lesson.chapterId ? tutorial.featured[target.chapterId]?.[0] : undefined;
      if (chapterStart) store.selectSite(chapterStart, target.screen === "globe");
      if (target.screen === "globe") store.setView("globe");
      const current = chapterStart ?? store.site;
      setCompared(new Set(current ? [siteKey(current)] : []));
      setComparisonSites(current ? [current] : []);
      setClockBaseline(store.elapsedHours);
      setEarthAcknowledged(false);
    }
    onLessonChange(next);
  };

  const aside = <aside aria-live="polite" aria-label="Guided mission lesson" className="absolute inset-x-2 bottom-2 z-30 max-h-[60%] overflow-y-auto rounded-xl border border-retro-purple/40 bg-[#100e20]/95 p-4 shadow-[0_18px_70px_rgba(4,2,18,.78)] backdrop-blur-xl lg:static lg:max-h-none lg:w-[23rem] lg:shrink-0 lg:rounded-none lg:border-0 lg:border-l lg:border-line lg:shadow-none">
    <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="mb-2 flex w-full items-center justify-between type-data text-[.56rem] uppercase tracking-[.12em] text-muted-foreground lg:hidden">
      <span>Guided mission · lesson {lessonIndex + 1} of {GUIDED_LESSONS.length}</span>{collapsed ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
    </button>
    <div className={collapsed ? "hidden lg:block" : ""}>
      <LessonCard lesson={lesson} chapter={chapter} complete={complete} onPrevious={lessonIndex > 0 ? () => goToLesson(lessonIndex - 1) : undefined} onNext={() => goToLesson(lessonIndex + 1)}
        nextLabel={GUIDED_LESSONS[lessonIndex + 1].screen === "drive" ? "Descend to the surface" : "Next lesson"}>
        {lesson.id === "pick-site" && <>
          <p className={lessonCheckClass}>CATALOG SITES LAYER {mark(showCatalog)} · SITE SELECTED {mark(site !== null)}{site ? ` · ${site.name}` : ""}</p>
          {featured[0] && <div className="mt-2 overflow-hidden border border-retro-purple/30 bg-void/70">
            <SitePreview site={site ?? featured[0]} />
            <button type="button" onClick={() => useFreeplay.getState().selectSite(featured[0], true)} className={`${lessonActionClass} mx-2 mb-2`}>View {featured[0].name}</button>
          </div>}
        </>}
        {lesson.id === "overlays" && <p className={lessonCheckClass}>OVERLAYS ON · {overlaysOn.length ? overlaysOn.join(", ") : "none yet"}</p>}
        {lesson.id === "sun" && <p className={lessonCheckClass}>ORBIT + GRAPHS OPEN {mark(view === "orbit")} · MISSION CLOCK MOVED {mark(clockMoved)}</p>}
        {lesson.id === "earth" && <button type="button" onClick={() => setEarthAcknowledged(true)} className={lessonActionClass}>{earthAcknowledged ? "Understood ✓" : "I understand visibility ≠ radio-link guarantee"}</button>}
        {lesson.id === "candidates" && <>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Selected landing sites being compared">
            {comparisonSites.map((candidate, index) => {
              const record = tutorial.catalog.find((entry) => entry.id === candidate.catalogId);
              return <div key={`${siteKey(candidate)}:${index}`} className="overflow-hidden border border-retro-purple/45 bg-void/70">
                <SitePreview site={candidate} compact />
                <span className="block px-2 py-1.5"><span className="block truncate text-[.6rem] font-medium text-bone">{candidate.name}</span><span className="mt-1 block text-[.52rem] leading-snug text-muted-foreground">{candidate.latitudeDeg.toFixed(2)}°, {candidate.longitudeDeg.toFixed(2)}° E · {record?.coordsVerified && !record.pointIsApproximate ? "verified point" : "approximate point"}</span></span>
              </div>;
            })}
            {comparisonSites.length < 2 && <div className="grid min-h-24 place-items-center border border-dashed border-line p-2 text-center text-[.55rem] text-muted-foreground">Choose another site to compare its imagery and orbit data.</div>}
          </div>
          {featured.length >= 2 && <p className="mt-1 type-data text-[.5rem] uppercase tracking-[.08em] text-retro-purple">The comparison previews follow the most recently selected sites</p>}
          {featured.length > 0 && <label className="mt-2 block type-data text-[.52rem] uppercase tracking-[.08em] text-muted-foreground">{(chapter ?? CHAPTER_LABELS[lesson.chapterId]).title} candidates
            <select value={featured.find((candidate) => candidate.id === site?.id)?.id ?? ""} onChange={(event) => { const target = featured.find((candidate) => candidate.id === event.target.value); if (target) useFreeplay.getState().selectSite(target, view === "globe"); }} className="hud-input mt-1 normal-case tracking-normal">
              <option value="">Choose a featured site</option>
              {featured.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>}
          <p className={lessonCheckClass}>SITES COMPARED {compared.size}{site ? ` · SELECTED ${site.name}` : " · NO SITE SELECTED"}</p>
        </>}
        {lesson.id !== "sun" && lesson.id !== "candidates" && view !== lesson.screen && <button type="button" onClick={() => useFreeplay.getState().setView(lesson.screen === "orbit" ? "orbit" : "globe")} className={lessonActionClass}>Go to {SCREEN_LABELS[lesson.screen]}</button>}
      </LessonCard>
    </div>
  </aside>;

  return <FreeplayApp aside={aside} />;
}
