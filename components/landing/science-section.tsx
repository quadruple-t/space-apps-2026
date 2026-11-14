import Link from "next/link";
import { HorizonProfile } from "@/components/graphics/horizon-profile";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { DATA_SOURCES } from "@/data/site";
import { METHOD_STEPS, SCIENCE_TOPICS } from "@/data/science";

export function ScienceSection() {
  return (
    <section id="how-it-works" aria-labelledby="science-title" className="relative border-t border-line py-24 sm:py-32">
      <PageContainer>
        <Reveal>
          <SectionHeading id="science-title" title="Real ephemerides. Clear provenance.">
            <p>
              Near the pole, latitude tells you very little. What matters is the horizon each site actually sees:
              the crater walls and distant massifs that decide when sunlight arrives and whether Earth is in view.
              Freeplay uses JPL Horizons ephemerides and available precomputed LOLA horizon masks. When a terrain
              mask is unavailable, it labels the smooth-sphere fallback and treats visibility shares as upper bounds.
            </p>
          </SectionHeading>
        </Reveal>

        {/* Horizon-mask explainer */}
        <Reveal className="mt-16 rounded-xl border border-line bg-charcoal/40 p-5 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h3 className="type-heading text-xl text-bone sm:text-2xl">The horizon mask</h3>
            <p className="text-sm text-muted-foreground">How an elevation mask describes terrain obstruction.</p>
          </div>
          <HorizonProfile className="mt-6" showLegend height={260} />
          <ol className="mt-10 grid gap-8 border-t border-line pt-8 md:grid-cols-3">
            {METHOD_STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="type-data text-xs text-sun">Step {i + 1}</span>
                <h4 className="mt-2 font-medium text-bone">{s.title}</h4>
                <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-2">
          <Reveal>
            <h3 className="text-sm font-medium text-bone">Data sources</h3>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {DATA_SOURCES.map((d) => (
                <li key={d.short} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-bone">
                      {d.name} <span className="type-data text-sm text-bone/55">({d.short})</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{d.role}</p>
                  </div>
                  <StatusBadge className="shrink-0">Used in Freeplay</StatusBadge>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={90}>
            <h3 className="text-sm font-medium text-bone">What it will analyse</h3>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {SCIENCE_TOPICS.map((t) => (
                <li key={t.title} className="py-5">
                  <p className="font-medium text-bone">{t.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm text-muted-foreground">
            Freeplay calculations use cached JPL Horizons ephemerides and available LOLA horizon masks. The 3D surface
            is procedural; results identify their horizon source, including the smooth-sphere fallback where terrain
            coverage is missing. The landing preview above remains conceptual.
          </p>
          <Button asChild size="lg" variant="outline">
            <Link href="/mission-control">Learn more</Link>
          </Button>
        </div>
      </PageContainer>
    </section>
  );
}
