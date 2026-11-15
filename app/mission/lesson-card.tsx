import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { StoryChapter } from "@/lib/model/types";
import { CHAPTER_LABELS, GUIDED_LESSONS, SCREEN_LABELS, type GuidedLesson } from "./tutorial-content";

const quietButton = "inline-flex min-h-10 items-center gap-2 rounded px-2 py-2 type-data text-xs font-medium text-muted-foreground";
export type LessonStage = "story" | "example" | "try";

/** One Story Mode lesson, shown as a story, an example, then a short task. */
export function LessonCard({ lesson, chapter, stage, complete, onPrevious, onStageChange, onNext, nextLabel = "Next lesson", children }: {
  lesson: GuidedLesson;
  chapter?: StoryChapter;
  stage: LessonStage;
  complete: boolean;
  onPrevious?: () => void;
  onStageChange: (stage: LessonStage) => void;
  onNext: () => void;
  nextLabel?: string;
  children?: ReactNode;
}) {
  const number = GUIDED_LESSONS.indexOf(lesson) + 1;
  const label = chapter ?? CHAPTER_LABELS[lesson.chapterId];
  const stageNumber = stage === "story" ? 1 : stage === "example" ? 2 : 3;
  const nextStage = stage === "story" ? "example" : "try";
  return <>
    <div className="flex items-center justify-between gap-2 pr-10 lg:pr-0"><span className="type-data text-sm text-retro-blue">{stage === "try" ? "Your turn" : label.title}</span><span className="type-data shrink-0 text-xs text-muted-foreground">Lesson {number} of {GUIDED_LESSONS.length}</span></div>
    {stage !== "try" && <div className="mt-3 flex gap-1" aria-label={`Part ${stageNumber} of 3`}>
      {(["Story", "Example", "Your turn"] as const).map((part, index) => <span key={part} className={`h-1.5 flex-1 rounded-full ${index < stageNumber ? "bg-retro-purple" : "bg-line"}`} />)}
    </div>}
    {stage !== "try" && <p className="mt-4 type-data text-xs text-retro-purple">{SCREEN_LABELS[lesson.screen]}</p>}
    <h2 tabIndex={-1} className={`type-heading mt-1 text-bone focus:outline-none ${stage === "try" ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl"}`}>{lesson.title}</h2>

    {stage === "story" && <section aria-label="Mission story" className="mt-4 space-y-4">
      <p className="text-base leading-relaxed text-bone">{lesson.story}</p>
      <div className="border-l-2 border-retro-red pl-3">
        <p className="type-data text-xs uppercase text-retro-red">Why this matters</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lesson.why}</p>
      </div>
    </section>}

    {stage === "example" && <section aria-label="Example" className="mt-4 rounded-lg border border-retro-blue/30 bg-retro-blue/5 p-4">
      <p className="type-data text-xs uppercase text-retro-blue">Example</p>
      <p className="mt-2 text-base leading-relaxed text-bone">{lesson.example}</p>
      {chapter && <details className="mt-4 border-t border-line/80 pt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-bone">Read the mission story</summary>
        <p className="mt-2 text-sm font-medium text-bone">{chapter.debrief.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{chapter.debrief.whatHappened}</p>
      </details>}
    </section>}

    {stage === "try" && <section aria-label="Your turn" className="mt-2 rounded-lg border border-retro-purple/35 bg-retro-purple/5 p-3 sm:mt-4 sm:p-4">
      {lesson.steps.length > 0 && <ol className="space-y-3">
        {lesson.steps.map((step, index) => <li key={step} className="grid grid-cols-[1.5rem_1fr] items-start gap-2 text-sm leading-relaxed text-bone">
          <span className="type-data grid size-6 place-items-center rounded-full border border-retro-purple/40 text-xs text-retro-purple">{index + 1}</span>
          <span>{step}</span>
        </li>)}
      </ol>}
      {children}
    </section>}

    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-3 flex items-center justify-between gap-2 border-t border-line/80 bg-[#100e20] px-4 pb-4 pt-3">
      <button type="button" onClick={onPrevious} disabled={!onPrevious} className={`${quietButton} hover:text-bone disabled:opacity-35`}><ArrowLeft size={16} />Back</button>
      {stage === "try"
        ? <button type="button" onClick={onNext} disabled={!complete} title={!complete ? "Complete the steps above to continue" : undefined} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-retro-purple px-4 py-2 type-data text-xs font-semibold text-void hover:bg-[#c2abff] disabled:cursor-not-allowed disabled:opacity-40">{nextLabel}<ArrowRight size={16} /></button>
        : <button type="button" onClick={() => onStageChange(nextStage)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-retro-purple px-4 py-2 type-data text-xs font-semibold text-void hover:bg-[#c2abff]">{stage === "story" ? "See an example" : "Now you try"}<ArrowRight size={16} /></button>}
    </div>
  </>;
}

export const lessonCheckClass = "mt-2 type-data text-xs leading-relaxed text-muted-foreground";
export const lessonActionClass = "mt-2 min-h-10 rounded border border-retro-blue/30 px-3 py-2 type-data text-xs text-retro-blue hover:bg-retro-blue/10";
