import type { Metadata } from "next";
import Link from "next/link";
import { DevelopmentNotice, PageIntro } from "@/components/experience/page-intro";
import { OtherExperiences } from "@/components/experience/other-experiences";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { LunarSceneLoader } from "@/scenes/lunar/lunar-scene-loader";

export const metadata: Metadata = {
  title: "Free Exploration",
  description: "Choose your own landing site at the lunar south pole and study its light and line of sight to Earth.",
};

const CAPABILITIES = [
  {
    title: "Choose a site",
    body: "Click the terrain or enter latitude and longitude to place a candidate landing site.",
  },
  {
    title: "Set the date",
    body: "Pick a simulation date and scrub through time to watch the Sun and Earth move along the horizon.",
  },
  {
    title: "Move around",
    body: "Stand at the site, orbit it, or switch to a top-down map of the surrounding terrain.",
  },
  {
    title: "Read the conditions",
    body: "Sun elevation, Earth elevation, the site's horizon mask, and a timeline of light and communication.",
  },
];

export default function ExplorePage() {
  return (
    <>
      <PageIntro
        index="02"
        title="Free Exploration"
        lede="Discover your own landing site."
        visual={
          <figure className="overflow-hidden rounded-xl border border-line">
            <div className="relative aspect-[4/5] sm:aspect-[16/9]">
              <LunarSceneLoader
                variant="preview"
                fallbackLabel="Illustration of lunar terrain where the exploration environment will run"
              />
              <span className="type-data absolute left-3 top-3 rounded-sm border border-sun/40 bg-void/70 px-2 py-1 text-[0.68rem] text-sun sm:left-5 sm:top-5">
                Visual preview · no controls yet
              </span>
            </div>
            <figcaption className="border-t border-line px-4 py-3 text-xs text-muted-foreground">
              Procedural terrain shown for look and feel only. Real LOLA terrain and site controls arrive in a later
              phase.
            </figcaption>
          </figure>
        }
      >
        <p>
          An open environment for your own questions. Choose any point near the south pole, set a date, and see
          what that site sees: when the Sun clears its horizon and when Earth is in view.
        </p>
      </PageIntro>

      <section aria-labelledby="capabilities" className="py-16 sm:py-24">
        <PageContainer>
          <h2 id="capabilities" className="type-heading text-2xl text-bone sm:text-3xl">
            What you&apos;ll be able to do
          </h2>
          <ul className="mt-10 grid gap-x-10 gap-y-8 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <li key={c.title}>
                <h3 className="font-medium text-bone">{c.title}</h3>
                <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <DevelopmentNotice>
              Free exploration is in development. The scene above is a procedural preview with no simulation behind
              it yet.
            </DevelopmentNotice>
            <Button asChild size="lg" variant="outline">
              <Link href="/mission">Start with the guided mission</Link>
            </Button>
          </div>
        </PageContainer>
      </section>

      <OtherExperiences current="explore" />
    </>
  );
}
