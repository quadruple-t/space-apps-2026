import type { Metadata } from "next";
import Link from "next/link";
import { DevelopmentNotice, PageIntro } from "@/components/experience/page-intro";
import { OtherExperiences } from "@/components/experience/other-experiences";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Mission Comparison",
  description: "Compare candidate lunar landing sites and dates side by side.",
};

const SLOTS = ["Site A", "Site B", "Site C"];

const METRICS = [
  { name: "Sunlight availability", detail: "Share of time the Sun clears the horizon" },
  { name: "Longest darkness", detail: "Longest continuous period without sunlight" },
  { name: "Earth visibility", detail: "Share of time Earth is above the horizon" },
  { name: "Communication windows", detail: "Number and length of direct-to-Earth periods" },
  { name: "Local slope", detail: "Terrain steepness at the landing point" },
];

export default function ComparePage() {
  return (
    <>
      <PageIntro index="03" title="Mission Comparison" lede="Find the strongest candidate.">
        <p>
          Put landing sites and dates next to each other. Synchronised 3D views show each site from the surface
          while the same metrics line up underneath, so differences are easy to spot.
        </p>
      </PageIntro>

      <section aria-labelledby="layout-title" className="py-16 sm:py-24">
        <PageContainer>
          <h2 id="layout-title" className="type-heading text-2xl text-bone sm:text-3xl">
            How a comparison will look
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Below is the empty layout. Sites are added from Free Exploration; the metrics fill in once each site has
            been analysed.
          </p>

          {/* Synchronised viewports — empty states */}
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {SLOTS.map((s) => (
              <li
                key={s}
                className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-bone/20 bg-charcoal/30 p-6 text-center"
              >
                <span className="type-data text-xs text-bone/55">{s}</span>
                <span className="mt-2 text-sm text-muted-foreground">No site selected</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Comparison metrics (empty until sites are analysed)</caption>
              <thead>
                <tr className="border-b border-line bg-charcoal/50">
                  <th scope="col" className="px-5 py-3.5 font-medium text-bone">
                    Metric
                  </th>
                  {SLOTS.map((s) => (
                    <th key={s} scope="col" className="type-data px-5 py-3.5 text-xs font-normal text-bone/60">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => (
                  <tr key={m.name} className="border-b border-line last:border-0">
                    <th scope="row" className="px-5 py-4 font-normal">
                      <span className="block text-bone">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">{m.detail}</span>
                    </th>
                    {SLOTS.map((s) => (
                      <td key={s} className="type-data px-5 py-4 text-bone/35">
                        <span aria-hidden>—</span>
                        <span className="sr-only">No data</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <DevelopmentNotice>
              Mission comparison is in development. No sites have been analysed, so every metric is empty by design.
            </DevelopmentNotice>
            <Button asChild size="lg" variant="outline">
              <Link href="/science">How the metrics will be computed</Link>
            </Button>
          </div>
        </PageContainer>
      </section>

      <OtherExperiences current="compare" />
    </>
  );
}
