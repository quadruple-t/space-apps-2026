import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SimulatorPreview } from "./simulator-preview";

const STEPS = [
  {
    title: "Place a landing site",
    body: "Pick a point on the terrain and stand on it. The surrounding ridges and crater walls become your horizon.",
  },
  {
    title: "Read its horizon",
    body: "See where the Sun and Earth travel against that horizon, and where the terrain cuts them off.",
  },
  {
    title: "Judge the conditions",
    body: "Turn the geometry into mission terms: how long the site stays lit, and when it can talk to Earth.",
  },
];

export function IntroductionSection() {
  return (
    <section id="mission" aria-labelledby="mission-title" className="relative border-t border-line py-24 sm:py-32">
      <PageContainer>
        <Reveal>
          <SectionHeading id="mission-title" title="See the mission from the surface.">
            <p>
              Lunaris360 turns complex lunar environmental data into a place you can stand in. Instead of reading
              tables of angles, you look across the terrain from a candidate landing site and see the Sun, the
              Earth and the ridges between them.
            </p>
          </SectionHeading>
        </Reveal>

        <Reveal className="mt-14">
          <SimulatorPreview />
        </Reveal>

        <ol className="mt-14 grid gap-10 border-t border-line pt-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 90}>
              <span className="type-data text-xs text-bone/50">Step {i + 1}</span>
              <h3 className="mt-2 text-lg font-medium text-bone">{s.title}</h3>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </PageContainer>
    </section>
  );
}
