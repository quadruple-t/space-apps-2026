import type { Metadata } from "next";
import Link from "next/link";
import { DevelopmentNotice, PageIntro } from "@/components/experience/page-intro";
import { OtherExperiences } from "@/components/experience/other-experiences";
import { HorizonProfile } from "@/components/graphics/horizon-profile";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Guided Mission",
  description: "An interactive tutorial on reading lighting and Earth visibility at the lunar south pole.",
};

const CHAPTERS = [
  {
    title: "Solar elevation",
    body: "How high the Sun climbs at the pole, and why it never climbs far. You'll watch it circle the horizon over a lunar day.",
  },
  {
    title: "Terrain obstruction",
    body: "How crater rims and distant massifs cut off a Sun that is only a degree or two above the horizon.",
  },
  {
    title: "Earth visibility",
    body: "Where Earth sits in the sky from the south pole, how it wobbles with libration, and when terrain hides it.",
  },
  {
    title: "Communication windows",
    body: "Turning Earth visibility over time into the periods when a lander can talk directly to Earth.",
  },
  {
    title: "Mission lighting conditions",
    body: "Putting it together: lit periods, stretches of darkness, and what they mean for power and temperature.",
  },
];

export default function MissionPage() {
  return (
    <>
      <PageIntro index="01" title="Guided Mission" lede="Understand the environment.">
        <p>
          A step-by-step introduction to the lunar south pole. Each chapter places you at a site, changes one thing,
          and shows you what it does to sunlight and to your view of Earth.
        </p>
      </PageIntro>

      <section aria-labelledby="chapters" className="py-16 sm:py-24">
        <PageContainer className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
          <div>
            <h2 id="chapters" className="type-heading text-2xl text-bone sm:text-3xl">
              What the tutorial covers
            </h2>
            <ol className="mt-8 border-t border-line">
              {CHAPTERS.map((c, i) => (
                <li key={c.title} className="grid grid-cols-[3rem_1fr] gap-2 border-b border-line py-6">
                  <span className="type-data pt-0.5 text-sm text-sun">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-medium text-bone">{c.title}</h3>
                    <p className="mt-1.5 text-pretty leading-relaxed text-muted-foreground">{c.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-8 lg:pt-14">
            <figure className="rounded-xl border border-line bg-charcoal/40 p-5 sm:p-6">
              <figcaption className="mb-5">
                <span className="font-medium text-bone">The idea every chapter builds on</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  A site&apos;s horizon decides when it sees the Sun and Earth.
                </span>
              </figcaption>
              <HorizonProfile showLegend height={230} />
            </figure>
            <DevelopmentNotice>
              The guided tutorial is being built in the next phase. Nothing on this page is interactive yet, and the
              chart above uses an illustrative horizon rather than real terrain.
            </DevelopmentNotice>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/">See the overview</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/mission-control">Learn the science</Link>
              </Button>
            </div>
          </div>
        </PageContainer>
      </section>

      <OtherExperiences current="mission" />
    </>
  );
}
