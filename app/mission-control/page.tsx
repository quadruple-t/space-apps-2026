import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DevelopmentNotice, PageIntro } from "@/components/experience/page-intro";
import { HorizonProfile } from "@/components/graphics/horizon-profile";
import { PageContainer } from "@/components/layout/page-container";
import { DATA_SOURCES } from "@/data/site";
import { METHOD_STEPS } from "@/data/science";
import { MissionFlashcards } from "@/components/mission-control/flashcards";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "How Shadowline will use LOLA terrain and JPL Horizons ephemerides to model lighting and Earth visibility.",
};

const CONSIDERATIONS = [
  {
    title: "Terrain resolution",
    body: "Features smaller than the elevation grid can't appear in the horizon. Mask accuracy depends on the DEM chosen for each region.",
  },
  {
    title: "The Sun is a disc, not a point",
    body: "At about half a degree wide, the Sun can be partly hidden by a ridge. Partial illumination needs to be handled explicitly.",
  },
  {
    title: "Earth's apparent size and libration",
    body: "Earth spans roughly two degrees and wanders by several degrees over a month, so visibility can change gradually.",
  },
  {
    title: "Height above the surface",
    body: "A solar panel or antenna on a mast sees a lower horizon than the ground. Observer height will be a site setting.",
  },
];

const GLOSSARY = [
  ["Horizon mask", "The elevation angle of the terrain skyline in every direction around a site."],
  ["Solar elevation", "The Sun's angle above the local horizontal plane."],
  ["Permanently shadowed region", "Ground, often a crater floor, that never receives direct sunlight."],
  ["Libration", "The slow apparent wobble of the Moon that shifts Earth's position in the lunar sky."],
  ["Direct-to-Earth", "Communication from the lunar surface straight to Earth, which needs an unobstructed line of sight."],
] as const;

export function MissionControlContent() {
  return (
    <>
      <PageIntro index="02" title="Debrief" lede="Understand the science behind lunar exploration." status="Learning library">
        <p>
          Space travel depends on getting the fundamentals right: where energy comes from, how spacecraft orient
          themselves, and how crews stay connected to Earth. Learning these concepts helps turn exploration into
          safer, more resilient missions—and builds knowledge that can support humanity far beyond Earth.
        </p>
      </PageIntro>

      <PageContainer className="pb-12">
        <div className="min-w-0">
      <section id="why-terrain" aria-labelledby="why-terrain-heading" className="scroll-mt-24 py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-20">
          <div>
            <h2 id="why-terrain-heading" className="type-heading text-2xl text-bone sm:text-3xl">
              Why actual terrain matters
            </h2>
          </div>
          <div className="space-y-5 text-pretty leading-relaxed text-muted-foreground sm:text-lg">
            <p>
              The Moon&apos;s spin axis is tilted only about one and a half degrees from the plane of its orbit around the
              Sun. At the poles, the Sun never rises high. It circles the horizon, skimming the skyline once every
              lunar day.
            </p>
            <p>
              With light arriving almost sideways, local topography decides everything. Some crater floors have not
              seen direct sunlight in billions of years, while nearby ridges stay lit for much of the year. Earth hangs
              low in the sky too, so the same ridges that cast shadows can also block communications.
            </p>
            <p className="text-bone/85">
              A flat-ground model gets this wrong. Shadowline is designed to use measured elevation to compute each
              site&apos;s true horizon.
            </p>
          </div>
        </div>
      </section>

      <section id="vocabulary" aria-labelledby="mission-vocabulary" className="scroll-mt-24 border-t border-line py-16 sm:py-24">
        <div>
          <div className="mb-10 max-w-3xl">
            <p className="type-data text-xs uppercase tracking-[0.18em] text-violet-300">Field guide / 01—06</p>
            <h2 id="mission-vocabulary" className="type-heading mt-3 text-3xl text-bone sm:text-4xl">Mission vocabulary</h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">Flip a card to learn a core idea used throughout Shadowline. These concepts connect the lunar surface to power, navigation, and communication.</p>
          </div>
          <MissionFlashcards />
        </div>
      </section>

      <section id="method" aria-labelledby="method-heading" className="scroll-mt-24 border-t border-line py-16 sm:py-24">
        <div>
          <h2 id="method-heading" className="type-heading text-2xl text-bone sm:text-3xl">
            The horizon mask
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            One line summarises a site: the skyline angle in every direction. Anything below it is hidden.
          </p>
          <div className="mt-10 rounded-xl border border-line bg-charcoal/40 p-5 sm:p-8">
            <HorizonProfile showLegend height={260} />
          </div>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {METHOD_STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-line pt-6">
                <span className="type-data text-xs text-sun">Step {i + 1}</span>
                <h3 className="mt-2 font-medium text-bone">{s.title}</h3>
                <p className="mt-1.5 text-pretty leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="data-sources" aria-labelledby="sources-title" className="scroll-mt-24 border-t border-line py-16 sm:py-24">
        <div>
          <h2 id="sources-title" className="type-heading text-2xl text-bone sm:text-3xl">
            Data sources
          </h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {DATA_SOURCES.map((d) => (
              <li key={d.short} className="flex flex-col rounded-lg border border-line p-6">
                <span className="type-data text-xs text-bone/55">{d.provider}</span>
                <h3 className="mt-3 text-lg font-medium text-bone">
                  {d.name} <span className="type-data text-sm text-bone/55">({d.short})</span>
                </h3>
                <p className="mt-2 flex-1 text-muted-foreground">{d.role}</p>
                <a
                  href={d.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-10 items-center text-sm text-bone underline decoration-bone/30 underline-offset-4 hover:decoration-sun"
                >
                  Visit {d.short}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="considerations" aria-labelledby="considerations-heading" className="scroll-mt-24 border-t border-line py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 id="considerations-heading" className="type-heading text-2xl text-bone sm:text-3xl">
              What the model must account for
            </h2>
            <ul className="mt-8 border-t border-line">
              {CONSIDERATIONS.map((c) => (
                <li key={c.title} className="border-b border-line py-5">
                  <h3 className="font-medium text-bone">{c.title}</h3>
                  <p className="mt-1.5 text-pretty text-muted-foreground">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="type-heading text-2xl text-bone sm:text-3xl">Glossary</h2>
            <dl className="mt-8 border-t border-line">
              {GLOSSARY.map(([term, def]) => (
                <div key={term} className="border-b border-line py-5">
                  <dt className="font-medium text-bone">{term}</dt>
                  <dd className="mt-1.5 text-pretty text-muted-foreground">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="mt-14">
          <DevelopmentNotice>
            Current status: Freeplay uses stored JPL Horizons ephemerides and available precomputed LOLA horizon masks
            through the versioned science API. Coverage varies by location, and unsupported locations use a labelled
            smooth-sphere horizon, so their sunlight and visibility shares are upper bounds. The rendered 3D surface and
            this page&apos;s diagrams are procedural or illustrative, not LOLA DEM visualisations, and a visibility
            result does not guarantee a communications link.
          </DevelopmentNotice>
        </div>
      </section>
        </div>
      </PageContainer>
    </>
  );
}

export default function MissionControlRedirect() {
  redirect("/how-it-works");
}
