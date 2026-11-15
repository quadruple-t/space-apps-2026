import Link from "next/link";
import { ExperienceGlyph } from "@/components/graphics/experience-glyphs";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { EXPERIENCES } from "@/data/site";

export function ExperienceCards() {
  return (
    <section id="explore" aria-labelledby="explore-title" className="relative border-t border-line py-24 sm:py-32">
      <PageContainer>
        <Reveal>
          <SectionHeading id="explore-title" title="Three ways to explore.">
            <p>
              Start with the guided Story Mode, or choose a place and explore the Moon yourself.
            </p>
          </SectionHeading>
        </Reveal>

        <ul className="mt-16 grid gap-5 lg:grid-cols-3 lg:gap-6">
          {EXPERIENCES.map((exp, i) => (
            <Reveal
              as="li"
              key={exp.id}
              delay={i * 90}
              className="group relative flex flex-col rounded-lg border border-line bg-charcoal/40 transition-[border-color,background-color] duration-300 hover:border-bone/30 hover:bg-charcoal/70"
            >
              <div className="flex items-center justify-between px-6 pt-6">
                <span className="type-data text-xs text-bone/55">{exp.index}</span>
                <StatusBadge>{exp.id === "explore" ? "Available now" : "In development"}</StatusBadge>
              </div>
              <div className="px-6 pt-6 opacity-80 transition-opacity duration-300 group-hover:opacity-100">
                <ExperienceGlyph id={exp.id} />
              </div>
              <div className="flex flex-1 flex-col p-6 pt-8">
                <h3 className="type-heading text-2xl text-bone">{exp.title}</h3>
                <p className="mt-2 text-lg text-bone/85">{exp.subtitle}</p>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{exp.description}</p>
                {exp.topics && (
                  <ul className="mt-5 flex flex-wrap gap-2" aria-label="Topics covered">
                    {exp.topics.map((t) => (
                      <li key={t} className="rounded-sm border border-line px-2 py-1 text-xs text-bone/75">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-8">
                  <Button asChild size="lg" variant={exp.id === "explore" ? "default" : "outline"} className="w-full sm:w-auto">
                    <Link href={exp.href}>{exp.cta}</Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
