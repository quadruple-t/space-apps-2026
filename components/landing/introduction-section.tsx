import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { SimulatorPreview } from "./simulator-preview";

const STEPS = [
  {
    title: "Choose a location",
    body: "Select a supported site or explore coordinates in the location picker. Terrain detail and horizon coverage vary by location.",
  },
  {
    title: "Set the mission time",
    body: "Move the clock and inspect JPL Horizons Sun and Earth positions from the selected lunar location.",
  },
  {
    title: "Inspect the window",
    body: "Review 24-hour sunlight and Earth-visibility summaries when a suitable horizon mask is available; smooth-horizon results are identified as upper bounds.",
  },
];

export function IntroductionSection() {
  return (
    <section id="mission" aria-labelledby="mission-title" className="relative border-t border-line py-24 sm:py-32">
      <PageContainer>
        <Reveal>
          <SectionHeading id="mission-title" title="See the mission from the surface.">
            <p>
              Freeplay combines time and location controls with a first-person lunar scene. Sun and Earth positions
              come from JPL Horizons ephemerides; where available, precomputed LOLA horizon masks determine
              visibility and 24-hour lighting and communications metrics. The rendered ground is procedural, so it
              is a visual guide rather than a terrain-accurate surface.
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
