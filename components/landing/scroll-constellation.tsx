"use client";

import { useEffect, useRef, useState } from "react";

const STOPS = [
  { id: "hero", label: "Mission horizon", x: 37, y: 18 },
  { id: "overview", label: "Lunar conditions", x: 54, y: 82 },
  { id: "mission", label: "Mission view", x: 22, y: 146 },
  { id: "explore", label: "Explore", x: 48, y: 210 },
  { id: "how-it-works", label: "Science and data", x: 20, y: 274 },
  { id: "launch", label: "Launch Freeplay", x: 43, y: 342 },
] as const;

const PATH = "M 37 18 C 83 46 81 60 54 82 C 26 104 0 124 22 146 C 44 168 75 188 48 210 C 21 232 0 252 20 274 C 40 296 69 320 43 342";

/** A quiet, clickable star path whose traveler follows the reader through the landing page. */
export function ScrollConstellation() {
  const pathRef = useRef<SVGPathElement>(null);
  const [motion, setMotion] = useState<{ progress: number; x: number; y: number; active: number }>({ progress: 0, x: STOPS[0].x, y: STOPS[0].y, active: 0 });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = STOPS.map(({ id }) => document.getElementById(id));
      const positions = sections.map((section) => section ? section.getBoundingClientRect().top + window.scrollY : null);
      const visibleStops = positions.flatMap((position, index) => position === null ? [] : [{ position, index }]);
      if (!visibleStops.length) return;

      const readingLine = window.scrollY + window.innerHeight * 0.42;
      let progress = 0;
      let active = 0;
      const first = visibleStops[0];
      const last = visibleStops[visibleStops.length - 1];

      if (readingLine >= last.position) {
        progress = 1;
        active = last.index;
      } else if (readingLine > first.position) {
        for (let index = 0; index < visibleStops.length - 1; index += 1) {
          const from = visibleStops[index];
          const to = visibleStops[index + 1];
          if (readingLine > to.position) continue;
          const span = Math.max(1, to.position - from.position);
          const segment = Math.max(0, Math.min(1, (readingLine - from.position) / span));
          progress = (from.index + segment) / (STOPS.length - 1);
          active = segment < 0.5 ? from.index : to.index;
          break;
        }
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        progress = active / (STOPS.length - 1);
      }

      const path = pathRef.current;
      const point = path
        ? path.getPointAtLength(path.getTotalLength() * progress)
        : { x: STOPS[0].x, y: STOPS[0].y };
      setMotion({ progress, x: point.x, y: point.y, active });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <>
    <p className="sr-only" aria-live="polite">Current landing page point: {STOPS[motion.active].label}</p>
    <nav aria-label="Landing page constellation navigation" className="fixed right-3 top-1/2 z-30 hidden h-[360px] w-[74px] -translate-y-1/2 lg:block 2xl:right-7">
      <svg viewBox="0 0 74 360" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <path d={PATH} pathLength={100} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
        <path d={PATH} pathLength={100} fill="none" stroke="var(--retro-purple)" strokeWidth="2" strokeDasharray="100" strokeDashoffset={100 - motion.progress * 100} strokeLinecap="round" />
        {STOPS.map((stop, index) => <path key={stop.id} d="M 0 -5 L 1.4 -1.4 L 5 0 L 1.4 1.4 L 0 5 L -1.4 1.4 L -5 0 L -1.4 -1.4 Z" transform={`translate(${stop.x} ${stop.y})`} fill={index <= motion.active ? "var(--retro-red)" : "var(--bone)"} opacity={index === motion.active ? 0.95 : index < motion.active ? 0.72 : 0.42} />)}
        <circle cx={motion.x} cy={motion.y} r="7" fill="var(--retro-purple)" opacity="0.2" />
        <path d="M 0 -6 L 1.8 -1.8 L 6 0 L 1.8 1.8 L 0 6 L -1.8 1.8 L -6 0 L -1.8 -1.8 Z" transform={`translate(${motion.x} ${motion.y})`} fill="var(--retro-red)" />
      </svg>
      <div className="absolute inset-0">
        {STOPS.map((stop, index) => <a key={stop.id} href={`#${stop.id}`} aria-label={`Scroll to ${stop.label}`} aria-current={index === motion.active ? "location" : undefined} title={stop.label} className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-retro-purple" style={{ left: `${(stop.x / 74) * 100}%`, top: `${(stop.y / 360) * 100}%` }}><span className="sr-only">{stop.label}</span></a>)}
      </div>
    </nav>

    <nav aria-label="Landing page constellation navigation" className="fixed inset-x-3 bottom-3 z-40 h-11 rounded-full border border-retro-purple/25 bg-void/85 shadow-[0_8px_32px_rgba(4,2,18,.45)] backdrop-blur-xl lg:hidden">
      <svg viewBox="0 0 600 44" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <path d="M 18 22 C 75 4 73 40 130 22 S 185 4 243 22 S 300 40 357 22 S 413 4 470 22 S 525 40 582 22" pathLength={100} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
        <path d="M 18 22 C 75 4 73 40 130 22 S 185 4 243 22 S 300 40 357 22 S 413 4 470 22 S 525 40 582 22" pathLength={100} fill="none" stroke="var(--retro-purple)" strokeWidth="2" strokeDasharray="100" strokeDashoffset={100 - motion.progress * 100} strokeLinecap="round" />
        {STOPS.map((stop, index) => <path key={stop.id} d="M 0 -5 L 1.4 -1.4 L 5 0 L 1.4 1.4 L 0 5 L -1.4 1.4 L -5 0 L -1.4 -1.4 Z" transform={`translate(${18 + index * 112.8} ${index % 2 === 0 ? 22 : 17})`} fill={index <= motion.active ? "var(--retro-red)" : "var(--bone)"} opacity={index === motion.active ? 0.95 : index < motion.active ? 0.72 : 0.42} />)}
        <circle cx={18 + motion.progress * 564} cy={22 - Math.sin(motion.progress * Math.PI * 5) * 5} r="7" fill="var(--retro-purple)" opacity="0.2" />
        <path d="M 0 -6 L 1.8 -1.8 L 6 0 L 1.8 1.8 L 0 6 L -1.8 1.8 L -6 0 L -1.8 -1.8 Z" transform={`translate(${18 + motion.progress * 564} ${22 - Math.sin(motion.progress * Math.PI * 5) * 5})`} fill="var(--retro-red)" />
      </svg>
      <div className="absolute inset-0">
        {STOPS.map((stop, index) => <a key={stop.id} href={`#${stop.id}`} aria-label={`Scroll to ${stop.label}`} aria-current={index === motion.active ? "location" : undefined} title={stop.label} className="absolute inset-y-0 z-10 grid w-[16.66%] -translate-x-1/2 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-retro-purple" style={{ left: `${(18 + index * 112.8) / 600 * 100}%` }}><span className="sr-only">{stop.label}</span></a>)}
      </div>
    </nav>
  </>;
}
