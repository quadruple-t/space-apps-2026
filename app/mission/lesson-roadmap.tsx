"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { GUIDED_LESSONS } from "./tutorial-content";

/**
 * A compact stepper along the bottom of the Guided Mission. Every lesson is a button, so a learner
 * can skip ahead or go back; the caller prepares the Open Exploration state the chosen lesson expects.
 */
export function LessonRoadmap({ current, completed, onSelect }: {
  current: number;
  completed: ReadonlySet<number>;
  onSelect: (index: number) => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  // On narrow screens the list scrolls sideways; keep the current lesson in view.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return <nav aria-label="Lesson roadmap" className="shrink-0 border-t border-line bg-[#0b0a16]">
    <ol className="flex items-center gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:none] sm:justify-center">
      {GUIDED_LESSONS.map((lesson, index) => {
        const isCurrent = index === current;
        const done = completed.has(index);
        return <li key={lesson.id} className="flex shrink-0 items-center gap-1">
          {index > 0 && <span aria-hidden className={`h-px w-2 sm:w-4 ${index <= current ? "bg-retro-purple/60" : "bg-line"}`} />}
          <button
            ref={isCurrent ? currentRef : undefined}
            type="button"
            onClick={() => { if (!isCurrent) onSelect(index); }}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`Lesson ${index + 1} of ${GUIDED_LESSONS.length}: ${lesson.title}${done ? " (completed)" : ""}`}
            title={lesson.title}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-1.5 py-1 type-data text-[.6rem] transition-colors ${isCurrent ? "bg-retro-purple/15 text-bone" : "text-muted-foreground hover:bg-white/5 hover:text-bone"}`}
          >
            <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border text-[.58rem] ${isCurrent ? "border-retro-purple bg-retro-purple text-void" : done ? "border-retro-purple/60 text-retro-purple" : "border-line"}`}>
              {done && !isCurrent ? <Check size={11} strokeWidth={3} /> : index + 1}
            </span>
            <span aria-hidden className={isCurrent ? "pr-1" : "hidden pr-1 md:inline"}>{lesson.short}</span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}
