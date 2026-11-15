"use client";

import { Fragment, useEffect, useState } from "react";

const STOPS = [
  { id: "why-terrain", title: "Terrain", detail: "Why the lunar horizon matters", x: 24, y: 22 },
  { id: "vocabulary", title: "Vocabulary", detail: "The language of lunar missions", x: 116, y: 81 },
  { id: "method", title: "Horizon mask", detail: "How the terrain profile is built", x: 46, y: 142 },
  { id: "data-sources", title: "Data sources", detail: "Where the measurements come from", x: 112, y: 207 },
  { id: "considerations", title: "Model limits", detail: "What the model must account for", x: 60, y: 278 },
] as const;

const CONSTELLATION_PATH = "M 24 22 Q 93 43 116 81 Q 131 108 46 142 Q 72 178 112 207 Q 140 238 60 278";

/** Scroll-linked star path that also acts as in-page navigation for the Debrief. */
export function ReadingConstellation() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const targets = STOPS.flatMap((stop, index) => {
      const element = document.getElementById(stop.id);
      return element ? [{ element, index }] : [];
    });
    if (!targets.length) return;

    let frame = 0;
    const updateActiveStop = () => {
      frame = 0;
      const readingLine = window.innerHeight * 0.42;
      const bounds = targets.map(({ element, index }) => ({ index, rect: element.getBoundingClientRect() }));
      const current = bounds.find(({ rect }) => rect.top <= readingLine && rect.bottom > readingLine);
      const next = bounds.find(({ rect }) => rect.top > readingLine);
      const last = bounds[bounds.length - 1];
      setActiveIndex((current ?? next ?? last).index);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveStop);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const activeStop = STOPS[activeIndex];
  const progress = (activeIndex / (STOPS.length - 1)) * 100;

  return <>
    <aside aria-label="Debrief constellation reading path" className="hidden lg:block">
      <div className="sticky top-28 rounded-xl border border-retro-red/25 bg-charcoal/75 p-4 shadow-[0_0_36px_rgba(255,83,107,0.08)] backdrop-blur-xl">
        <p className="type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-red">Reading constellation</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Scroll the debrief to trace the path between ideas.</p>

        <div className="relative mx-auto mt-4 h-[300px] w-[150px]" aria-hidden="true">
          <svg viewBox="0 0 150 300" className="absolute inset-0 size-full overflow-visible">
            <path d={CONSTELLATION_PATH} pathLength={100} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
            <path d={CONSTELLATION_PATH} pathLength={100} fill="none" stroke="var(--retro-red)" strokeWidth="2" strokeDasharray="100" strokeDashoffset={100 - progress} strokeLinecap="round" className="transition-[stroke-dashoffset] duration-700" />
            {STOPS.map((stop) => <circle key={stop.id} cx={stop.x} cy={stop.y} r="2.3" fill="var(--bone)" opacity="0.32" />)}
          </svg>
          {STOPS.map((stop, index) => {
            const active = index === activeIndex;
            const passed = index < activeIndex;
            return <a
              key={stop.id}
              href={`#${stop.id}`}
              aria-label={`Scroll to ${stop.detail}`}
              aria-current={active ? "step" : undefined}
              title={stop.detail}
              className={`absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-all duration-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-retro-red ${active ? "reading-star-active z-10 scale-110 text-retro-red" : passed ? "text-retro-red/80 hover:text-retro-red" : "text-bone/45 hover:text-bone"}`}
              style={{ left: `${(stop.x / 150) * 100}%`, top: `${(stop.y / 300) * 100}%` }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path d="M12 1.5 14.4 9.6 22.5 12 14.4 14.4 12 22.5 9.6 14.4 1.5 12 9.6 9.6 12 1.5Z" fill="currentColor" opacity={active ? 1 : passed ? 0.72 : 0.48} />
                {active && <circle cx="12" cy="12" r="2" fill="var(--bone)" />}
              </svg>
            </a>;
          })}
        </div>

        <div className="border-t border-retro-red/20 pt-3" aria-live="polite">
          <p className="type-data text-[0.55rem] uppercase tracking-[0.12em] text-retro-red">Point {String(activeIndex + 1).padStart(2, "0")} / {String(STOPS.length).padStart(2, "0")}</p>
          <h2 className="type-heading mt-1.5 text-sm text-bone">{activeStop.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeStop.detail}</p>
        </div>
      </div>
    </aside>

    <nav aria-label="Debrief reading path" className="sticky top-[calc(var(--nav-height)+0.5rem)] z-30 flex items-center justify-between gap-1 rounded-xl border border-retro-red/25 bg-void/90 px-2 py-2 shadow-lg backdrop-blur-xl lg:hidden">
      {STOPS.map((stop, index) => <Fragment key={stop.id}>
        <a
          href={`#${stop.id}`}
          aria-label={`Scroll to ${stop.detail}`}
          aria-current={index === activeIndex ? "step" : undefined}
          title={stop.title}
          className={`grid size-8 shrink-0 place-items-center rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-retro-red ${index === activeIndex ? "reading-star-active bg-retro-red/15 text-retro-red" : index < activeIndex ? "text-retro-red/80" : "text-bone/45"}`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M12 1.5 14.4 9.6 22.5 12 14.4 14.4 12 22.5 9.6 14.4 1.5 12 9.6 9.6 12 1.5Z" />
          </svg>
        </a>
        {index < STOPS.length - 1 && <span aria-hidden="true" className={`h-px min-w-2 flex-1 transition-colors ${index < activeIndex ? "bg-retro-red" : "bg-line"}`} />}
      </Fragment>)}
      <span className="sr-only" aria-live="polite">Reading point {activeIndex + 1} of {STOPS.length}: {activeStop.title}</span>
    </nav>
  </>;
}
