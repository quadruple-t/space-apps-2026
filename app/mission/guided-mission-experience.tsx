"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Compass, Play, Radio, Sun } from "lucide-react";
import { useFreeplay } from "@/lib/freeplay-store";
import { CHAPTER_IDS } from "@/lib/model/types";
import { GuidedPlanner } from "./guided-planner";
import { CHAPTER_LABELS, GUIDED_LESSONS, GUIDED_START_UTC } from "./tutorial-content";
import { StoryPage } from "./story-page";
import { useTutorialData } from "./use-tutorial-data";

export function GuidedMissionExperience() {
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  const tutorial = useTutorialData();

  // The tutorial runs in Freeplay's own store, so it starts from Freeplay's opening state.
  const start = () => {
    useFreeplay.getState().setStart(GUIDED_START_UTC);
    useFreeplay.setState((state) => ({
      view: "globe", site: null, calloutOpen: false, showCatalog: false,
      layers: { slope: { ...state.layers.slope, on: false }, illumination: { ...state.layers.illumination, on: false }, psr: { ...state.layers.psr, on: false }, elevation: { ...state.layers.elevation, on: false } },
    }));
    setLessonIndex(0);
  };
  const changeLesson = (next: number) => setLessonIndex(next);

  if (lessonIndex !== null) {
    const lesson = GUIDED_LESSONS[lessonIndex];
    if (lesson.screen === "story") return <StoryPage lesson={lesson} chapter={tutorial.chapters[lesson.chapterId]} onPrevious={lessonIndex > 0 ? () => changeLesson(lessonIndex - 1) : undefined} onNext={() => changeLesson(lessonIndex + 1)} />;
    return <GuidedPlanner tutorial={tutorial} lessonIndex={lessonIndex} onLessonChange={changeLesson} />;
  }

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-5rem)] items-center overflow-hidden bg-void px-5 py-16 text-bone sm:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_45%,rgba(75,155,255,.16),transparent_42%),radial-gradient(ellipse_at_22%_80%,rgba(169,134,255,.13),transparent_38%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 type-data text-xs uppercase tracking-[.15em] text-muted-foreground transition hover:text-retro-blue"><ArrowLeft size={14}/> Main menu</Link>
          <p className="mt-10 type-data text-xs uppercase tracking-[.24em] text-retro-red">Lunaris360 / guided mission</p>
          <h1 className="type-heading mt-4 max-w-3xl text-4xl leading-[1.02] text-bone sm:text-6xl">The journey<br/>to the Moon.</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">From humanity&apos;s first landing to a potential mining lunar base, take three missions through the decisions that shape exploration. Each chapter pairs a historical challenge with live Lunaris360 tools.</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Compass size={15} className="text-retro-purple"/> {GUIDED_LESSONS.length} mission pages</span>
            <span className="inline-flex items-center gap-2"><Sun size={15} className="text-retro-red"/> Three exploration eras</span>
            <span className="inline-flex items-center gap-2"><Radio size={15} className="text-retro-blue"/> Apollo · robotic · Artemis</span>
          </div>
          <button type="button" disabled={tutorial.status === "loading"} onClick={start} className="mt-9 inline-flex h-12 items-center gap-3 rounded-lg bg-retro-purple px-6 type-data text-xs font-semibold uppercase tracking-[.16em] text-void shadow-[0_0_35px_rgba(169,134,255,.24)] transition hover:bg-[#c2abff] disabled:cursor-wait disabled:opacity-60"><Play size={15} fill="currentColor"/> {tutorial.status === "loading" ? "Loading mission data" : "Begin your journey"}</button>
          <Link href="/mission-control" className="ml-5 inline-flex h-12 items-center type-data text-xs uppercase tracking-[.16em] text-muted-foreground transition hover:text-retro-blue">Learn the science</Link>
          {tutorial.status === "unavailable" && <p role="status" className="mt-3 max-w-xl text-xs leading-relaxed text-retro-red">The site catalog is unavailable, so the lessons run without chapter records or featured sites. You can still pick any point on the globe.</p>}
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-retro-blue/20 bg-[#10101d]/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <div aria-hidden className="absolute -right-10 -top-12 size-56 rounded-full border border-retro-blue/20 bg-[radial-gradient(circle_at_35%_35%,#8799ff,#394368_50%,#141827_72%)] shadow-[0_0_90px_rgba(75,155,255,.18)]" />
          <p className="relative type-data text-[.62rem] uppercase tracking-[.18em] text-retro-blue">Mission sequence</p>
          <ol className="relative mt-6 space-y-5">
            {CHAPTER_IDS.map((id, index)=>{
              const chapter = tutorial.chapters[id] ?? CHAPTER_LABELS[id];
              const startSite = tutorial.featured[id]?.[0];
              return <li key={id} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-line/80 pt-4"><span className="type-data text-xs text-retro-red">{String(index + 1).padStart(2, "0")}</span><div><h2 className="type-heading text-lg text-bone">{chapter.title}</h2><p className="type-data mt-1 text-[.6rem] uppercase tracking-[.12em] text-retro-blue">{chapter.era}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{chapter.concept}.{startSite ? ` Starts at ${startSite.name}.` : ""}</p></div></li>;
            })}
          </ol>
          <p className="relative mt-7 border-t border-line/80 pt-4 text-xs leading-relaxed text-muted-foreground">The journey uses Lunaris360&apos;s globe, timeline, map layers, and graphs. Sun and Earth positions come from stored JPL Horizons ephemerides; visibility uses a LOLA horizon mask where one exists, otherwise a labelled smooth-sphere horizon gives upper bounds. This is an educational experience, not a mission recommendation.</p>
        </div>
      </div>
    </main>
  );
}
