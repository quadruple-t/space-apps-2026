import Link from "next/link";
import { LunarHorizonIllustration } from "@/components/graphics/lunar-horizon-illustration";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { LAUNCH_HREF } from "@/data/site";

export function FinalCTA() {
  return (
    <section id="launch" aria-labelledby="final-cta-title" className="relative isolate overflow-hidden border-t border-line">
      <div className="absolute inset-0 -z-10">
        <LunarHorizonIllustration />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-void via-void/20 via-35% to-transparent" />
      </div>
      {/* Bottom padding leaves the skyline clear below the call to action. */}
      <PageContainer className="flex flex-col items-center pb-[clamp(15rem,32vw,24rem)] pt-28 text-center sm:pt-36">
        <Reveal>
          <h2
            id="final-cta-title"
            className="type-display mx-auto max-w-5xl text-balance text-[clamp(2.3rem,5.6vw,5.25rem)] text-bone"
          >
            Your mission starts at the horizon.
          </h2>
          <p className="mx-auto mt-7 max-w-xl text-balance text-lg text-bone/80">
            Explore the lunar south pole. Discover the challenges. Find your landing site.
          </p>
          <Button asChild size="xl" className="mt-10">
            <Link href={LAUNCH_HREF}>Launch Freeplay</Link>
          </Button>
        </Reveal>
      </PageContainer>
    </section>
  );
}
