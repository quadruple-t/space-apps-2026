import type { Metadata } from "next";
import Link from "next/link";
import { DevelopmentNotice, PageIntro } from "@/components/experience/page-intro";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ComparisonClient } from "./comparison-client";

export const metadata: Metadata = {
  title: "Mission Comparison",
  description: "Compare candidate lunar landing sites and dates side by side.",
};

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

          <ComparisonClient />

          <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <DevelopmentNotice>
              Comparison metrics use cached JPL Horizons ephemerides and available LOLA horizon masks. Any smooth-horizon fallback is labelled in the result provenance.
            </DevelopmentNotice>
            <Button asChild size="lg" variant="outline">
              <Link href="/how-it-works">How the metrics are computed</Link>
            </Button>
          </div>
        </PageContainer>
      </section>

    </>
  );
}
