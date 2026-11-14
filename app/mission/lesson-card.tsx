import type { ReactNode } from "react";
import type { StoryChapter } from "@/lib/model/types";
import { CHAPTER_LABELS, GUIDED_LESSONS, SCREEN_LABELS, type GuidedLesson } from "./tutorial-content";

const quietButton = "rounded px-2 py-2 type-data text-[.55rem] uppercase tracking-[.1em] text-muted-foreground";

/** One tutorial lesson. `children` holds the live checks for that lesson's objective. */
export function LessonCard({ lesson, chapter, complete, onPrevious, onNext, nextLabel = "Next lesson", children }: {
  lesson: GuidedLesson;
  chapter?: StoryChapter;
  complete: boolean;
  onPrevious?: () => void;
  onNext: () => void;
  nextLabel?: string;
  children?: ReactNode;
}) {
  const number = GUIDED_LESSONS.indexOf(lesson) + 1;
  const label = chapter ?? CHAPTER_LABELS[lesson.chapterId];
  return <>
    <div className="flex items-center justify-between gap-2"><span className="type-data text-[.56rem] uppercase tracking-[.12em] text-retro-blue">{label.title} · {label.era}</span><span className="type-data shrink-0 text-[.58rem] text-retro-red">LESSON {number} OF {GUIDED_LESSONS.length}</span></div>
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gradient-to-r from-retro-purple via-retro-blue to-retro-red transition-[width]" style={{ width: `${(number / GUIDED_LESSONS.length) * 100}%` }}/></div>
    <p className="mt-3 type-data text-[.54rem] uppercase tracking-[.13em] text-retro-purple">Freeplay · {SCREEN_LABELS[lesson.screen]}</p>
    <h2 className="type-heading mt-1 text-xl text-bone">{lesson.title}</h2>
    <p className="mt-2 text-[.78rem] leading-relaxed text-muted-foreground">{lesson.body}</p>
    <div className="mt-3 rounded-lg border border-retro-blue/25 bg-retro-blue/5 p-3">
      <div className="type-data text-[.54rem] uppercase tracking-[.13em] text-retro-blue">Mission objective</div>
      <p className="mt-1 text-xs leading-relaxed text-bone">{lesson.objective}</p>
      {children}
    </div>
    <p className="mt-2 text-[.67rem] leading-relaxed text-muted-foreground"><span className="text-retro-red">TAKEAWAY</span> · {lesson.takeaway}</p>
    {chapter && <details className="mt-2 border-t border-line/80 pt-2">
      <summary className="cursor-pointer type-data text-[.54rem] uppercase tracking-[.1em] text-muted-foreground hover:text-bone">Mission record · {chapter.debrief.realMission}</summary>
      <p className="mt-2 text-xs font-medium text-bone">{chapter.debrief.headline}</p>
      <p className="mt-1 text-[.67rem] leading-relaxed text-muted-foreground">{chapter.debrief.whatHappened}</p>
      <dl className="mt-2 space-y-1.5">{chapter.debrief.keyNumbers.map((item) => <div key={item.label}><dt className="type-data text-[.52rem] uppercase tracking-[.08em] text-retro-blue">{item.label}</dt><dd className="text-[.67rem] leading-relaxed text-bone">{item.value}{item.sources?.[0]?.url && <> · <a href={item.sources[0].url} target="_blank" rel="noreferrer" className="text-muted-foreground underline hover:text-bone">source</a></>}</dd></div>)}</dl>
    </details>}
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/80 pt-3">
      <button type="button" onClick={onPrevious} disabled={!onPrevious} className={`${quietButton} hover:text-bone disabled:opacity-35`}>Previous</button>
      <button type="button" onClick={onNext} disabled={!complete} className="rounded-lg bg-retro-purple px-3.5 py-2 type-data text-[.56rem] font-semibold uppercase tracking-[.11em] text-void hover:bg-[#c2abff] disabled:cursor-not-allowed disabled:opacity-40">{nextLabel}</button>
      <button type="button" onClick={onNext} className={`${quietButton} hover:text-retro-red`}>Skip</button>
    </div>
  </>;
}

export const lessonCheckClass = "mt-2 type-data text-[.52rem] leading-relaxed text-muted-foreground";
export const lessonActionClass = "mt-2 rounded border border-retro-blue/30 px-2.5 py-1.5 type-data text-[.54rem] uppercase tracking-[.08em] text-retro-blue hover:bg-retro-blue/10";
