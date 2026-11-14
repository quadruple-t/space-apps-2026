import { Hero } from "@/components/landing/hero";
import { IntroductionSection } from "@/components/landing/introduction-section";
import { PageContainer } from "@/components/layout/page-container";

export default function HomePage() {
  return (
    <>
      <Hero />
      <IntroductionSection />
      <section className="border-t border-line py-20 sm:py-28" aria-labelledby="project-direction">
        <PageContainer>
          <p className="type-data text-xs uppercase tracking-[0.18em] text-violet-300">Project direction / open mission intelligence</p>
          <h2 id="project-direction" className="type-heading mt-4 max-w-4xl text-3xl text-bone sm:text-5xl">A clearer view of where, when, and why to explore.</h2>
          <p className="mt-5 max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground">Shadowline is being designed as both a low-poly lunar simulation and an interactive learning space. It will help people connect terrain, sunlight, power, and Earth communications—then compare candidate places and dates using transparent environmental measures.</p>
          <ul className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01 / Understand", "Learn the mission vocabulary and trade-offs before entering the simulation."],
              ["02 / Visualize", "Explore how lunar ridges shape solar illumination and direct-to-Earth visibility."],
              ["03 / Compare", "Assess candidate sites and dates with clearly stated methods and uncertainty."],
              ["04 / Share", "Build a free, classroom-friendly resource spanning lunar missions from many nations."],
            ].map(([title, body]) => <li key={title} className="bg-void p-6 sm:p-7"><span className="type-data text-xs text-violet-300">{title}</span><p className="mt-3 leading-relaxed text-bone/75">{body}</p></li>)}
          </ul>
          <p className="type-data mt-5 text-xs leading-relaxed text-bone/50">Current build note: terrain, ephemerides, site comparisons, and impact overlays are planned; today’s scene and example charts are illustrative.</p>
        </PageContainer>
      </section>
    </>
  );
}
