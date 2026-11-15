import type { ReactNode } from "react";
import { CommsDiagram, LightingDiagram, TradeoffDiagram } from "@/components/graphics/challenge-diagrams";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

type Challenge = {
  index: string;
  title: string;
  body: string;
  accent: "sun" | "earth" | "bone";
  diagram: ReactNode;
};

const CHALLENGES: Challenge[] = [
  {
    index: "01",
    title: "Extreme lighting",
    body: "The Moon's south pole experiences unusual lighting conditions. Small differences in elevation and terrain can dramatically influence sunlight availability.",
    accent: "sun",
    diagram: <LightingDiagram />,
  },
  {
    index: "02",
    title: "Communication constraints",
    body: "Earth visibility depends on the geometry between the lunar surface, Earth's apparent position, and surrounding terrain.",
    accent: "earth",
    diagram: <CommsDiagram />,
  },
  {
    index: "03",
    title: "Complex decisions",
    body: "Mission planners must balance solar availability, communication windows, and terrain when evaluating candidate landing locations.",
    accent: "bone",
    diagram: <TradeoffDiagram />,
  },
];

const ACCENT = {
  sun: "text-sun before:bg-sun",
  earth: "text-earth before:bg-earth",
  bone: "text-bone before:bg-bone",
};

export function ChallengeSection() {
  return (
    <section id="overview" data-constellation-node="Lunar conditions" aria-labelledby="overview-title" className="relative py-24 sm:py-32">
      <PageContainer>
        <Reveal>
          <SectionHeading id="overview-title" title="A world where every degree matters.">
            <p>
              At the south pole the Sun never climbs more than about a degree and a half above the horizon. A ridge a
              few hundred metres high can decide whether a site sits in near-constant light or in permanent shadow,
              and whether Earth is in view at all.
            </p>
          </SectionHeading>
        </Reveal>

        <ul className="mt-16 grid gap-5 md:grid-cols-3 lg:gap-6">
          {CHALLENGES.map((c, i) => (
            <Reveal as="li" key={c.index} delay={i * 90} className="group flex flex-col rounded-lg border border-line bg-charcoal/50 transition-colors duration-300 hover:border-bone/25">
              <div className="border-b border-line px-5 pb-4 pt-6">{c.diagram}</div>
              <div className="flex flex-1 flex-col p-6">
                <p
                  className={cn(
                    "type-data relative flex items-center gap-3 text-xs before:h-px before:w-6 before:content-['']",
                    ACCENT[c.accent],
                  )}
                >
                  {c.index}
                </p>
                <h3 className="type-heading mt-4 text-xl text-bone sm:text-[1.4rem]">{c.title}</h3>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
        <p className="type-data mt-5 text-[0.7rem] text-bone/45">Diagrams are schematic and not to scale.</p>
      </PageContainer>
    </section>
  );
}
