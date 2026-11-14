"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Map, Radio, Sun } from "lucide-react";
import type { StoryChapter } from "@/lib/model/types";
import { CHAPTER_LABELS, GUIDED_LESSONS, type GuidedLesson } from "./tutorial-content";

const chapterIcons = { "ch1-first-landing": Sun, "ch2-robotic-explorer": Radio, "ch3-lunar-base": Map };

export function StoryPage({ lesson, chapter, onPrevious, onNext }: { lesson: GuidedLesson; chapter?: StoryChapter; onPrevious?: () => void; onNext: () => void }) {
  const chapterLabel = chapter ?? CHAPTER_LABELS[lesson.chapterId];
  const Icon = chapterIcons[lesson.chapterId];
  const index = GUIDED_LESSONS.indexOf(lesson) + 1;
  const isFinal = index === GUIDED_LESSONS.length;
  const isDebrief = lesson.phase === "debrief";

  return <main className="relative isolate flex min-h-[calc(100dvh-5rem)] overflow-hidden bg-void px-5 py-10 text-bone sm:px-10 sm:py-16">
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_74%_32%,rgba(75,155,255,.15),transparent_38%),radial-gradient(ellipse_at_20%_78%,rgba(169,134,255,.12),transparent_36%)]" />
    <div className="relative mx-auto flex w-full max-w-5xl flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-bone"><ArrowLeft size={15}/> Leave guided mission</Link>
        <span className="text-xs text-muted-foreground">Page {index} of {GUIDED_LESSONS.length}</span>
      </div>
      <div className="mt-8 h-px bg-line"><div className="h-px bg-retro-purple transition-[width]" style={{ width: `${(index / GUIDED_LESSONS.length) * 100}%` }}/></div>
      <section className="my-auto grid flex-1 gap-10 py-16 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <div className="relative grid aspect-square max-h-80 place-items-center overflow-hidden rounded-full border border-retro-purple/35 bg-[radial-gradient(circle_at_38%_34%,#5e5b72,30%,#252334_55%,#100e20_72%)] shadow-[0_0_90px_rgba(120,90,255,.16)]">
          <div className="absolute inset-[13%] rounded-full border border-bone/10" />
          <div className="absolute inset-[27%] rounded-full border border-retro-blue/20" />
          <Icon size={70} strokeWidth={1} className="text-retro-blue" />
        </div>
        <div>
          <p className="text-sm text-retro-purple">{lesson.kicker}</p>
          <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-none text-bone sm:text-6xl">{lesson.title}</h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">{lesson.body}</p>
          <div className="mt-8 border-l-2 border-retro-blue/70 pl-4 text-sm leading-relaxed text-bone/85">
            {isDebrief ? <><strong className="font-medium">Tool unlocked: </strong>{chapter?.unlocksTool === "horizon-dial" ? "Lunar horizon explorer" : chapter?.unlocksTool === "power-simulator" ? "Power and communication explorer" : "Mining base suitability assessment"}.</> : <><strong className="font-medium">Your role: </strong>{chapterLabel.era} mission planner.</>}
          </div>
          {isFinal && <div className="mt-7 flex items-start gap-3 rounded-lg border border-retro-blue/25 bg-retro-blue/5 p-4 text-sm leading-relaxed text-muted-foreground"><CheckCircle2 className="mt-0.5 shrink-0 text-retro-blue" size={18}/><span>Mission Control contains the map, illumination, terrain, and visibility tools used throughout this journey.</span></div>}
        </div>
      </section>
      <div className="flex items-center justify-between border-t border-line pt-6">
        <button type="button" onClick={onPrevious} disabled={!onPrevious} className="text-sm text-muted-foreground transition hover:text-bone disabled:invisible">Previous page</button>
        {isFinal ? <Link href="/mission-control" className="inline-flex items-center gap-2 rounded-lg bg-retro-purple px-5 py-3 text-sm font-medium text-void transition hover:bg-[#c2abff]">Enter Mission Control <ArrowRight size={16}/></Link> : <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-lg bg-retro-purple px-5 py-3 text-sm font-medium text-void transition hover:bg-[#c2abff]">{isDebrief ? "Begin next chapter" : "Continue mission"} <ArrowRight size={16}/></button>}
      </div>
    </div>
  </main>;
}
