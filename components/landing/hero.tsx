import Link from "next/link";
import { ArrowDown, ArrowUpRight, ChevronRight } from "lucide-react";
import { ExperienceGlyph } from "@/components/graphics/experience-glyphs";
import { PageContainer } from "@/components/layout/page-container";
import { HeroHud } from "@/components/landing/hero-hud";
import { Button } from "@/components/ui/button";
import { LAUNCH_HREF } from "@/data/site";
import { LunarSceneLoader } from "@/scenes/lunar/lunar-scene-loader";

const ROUTES = [
  { index: "01", title: "Mission", subtitle: "Follow a guided lunar tutorial.", href: "/mission", glyph: "mission" },
  { index: "02", title: "Mission Control", subtitle: "Learn the science behind the mission.", href: "/mission-control", glyph: "compare" },
  { index: "03", title: "Free Play · Explore", subtitle: "Explore the terrain at your own pace.", href: "/explore", glyph: "explore" },
] as const;

export function Hero() {
  return (
    <section id="overview" aria-labelledby="hero-title" className="relative isolate min-h-[100svh] overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <LunarSceneLoader variant="hero" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-void/95 via-void/75 via-45% to-void/35" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/15 via-35% to-void/50" />
        <div aria-hidden className="lunar-grid absolute inset-0 opacity-40" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-void/60 to-transparent" />
      </div>

      <PageContainer className="relative flex min-h-[100svh] flex-col justify-center pb-6 pt-24 sm:pb-8 sm:pt-28">
        <div className="type-data mb-5 flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.17em] text-bone/65 sm:mb-7">
          <span className="size-2 rotate-45 bg-sun shadow-[0_0_14px_var(--sun)]" aria-hidden />
          <span>Shadowline / Mission control</span>
          <span className="hidden h-px w-12 bg-bone/25 sm:block" aria-hidden />
          <span className="hidden sm:inline">Lunar south pole · 89° S</span>
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(21rem,0.92fr)] lg:gap-14">
          <div className="max-w-2xl">
            <p className="type-data mb-4 text-xs uppercase tracking-[0.2em] text-sun">Read the terrain. Plan the mission.</p>
            <h1 id="hero-title" className="type-display text-[clamp(3rem,7.4vw,7.4rem)] text-bone">
              <span className="hero-line" style={{ "--line-delay": "80ms" } as React.CSSProperties}>Find your line</span>
              <span className="hero-line text-bone/75" style={{ "--line-delay": "220ms" } as React.CSSProperties}>across the Moon.</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-bone/75 sm:mt-7 sm:text-lg">
              See how ridges shape sunlight and Earth visibility at the lunar south pole. Choose a route to start exploring
              the mission.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl">
                <Link href={LAUNCH_HREF}>Launch Freeplay</Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="/mission">Discover the Mission</Link>
              </Button>
            </div>
          </div>

          <section aria-labelledby="route-picker-title" className="mission-console">
            <div className="mission-console-heading">
              <div>
                <p className="type-data text-[0.62rem] uppercase tracking-[0.18em] text-sun">Select a route</p>
                <h2 id="route-picker-title" className="type-heading mt-2 text-2xl text-bone sm:text-3xl">Your mission starts here</h2>
              </div>
              <span className="type-data shrink-0 border border-bone/20 px-2 py-1 text-[0.58rem] uppercase tracking-wider text-bone/50">01—03</span>
            </div>

            <ul className="mt-5 grid gap-2.5">
              {ROUTES.map((route) => (
                <li key={route.href}>
                  <Link href={route.href} className="route-choice group">
                    <span className="route-glyph" aria-hidden><ExperienceGlyph id={route.glyph} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="type-data block text-[0.6rem] uppercase tracking-[0.14em] text-bone/45">Route {route.index}</span>
                      <span className="type-heading mt-1 block text-lg text-bone transition-colors group-hover:text-sun">{route.title}</span>
                      <span className="mt-1 block text-sm leading-snug text-bone/60">{route.subtitle}</span>
                    </span>
                    <span className="route-arrow" aria-hidden><ChevronRight className="size-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="type-data mt-4 flex items-center gap-2 text-[0.62rem] leading-relaxed text-bone/45">
              <span className="size-1.5 rotate-45 border border-sun/70" aria-hidden />
            Choose a page to begin or learn at your own pace.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-bone/15 pt-4 sm:mt-9 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-data max-w-2xl text-[0.61rem] leading-relaxed text-bone/45">
            Concept preview. Terrain is procedurally generated and displayed values are illustrative, not mission telemetry or LOLA-derived data.
          </p>
          <Link href="#overview-guide" className="type-data inline-flex shrink-0 items-center gap-2 text-[0.65rem] uppercase tracking-wider text-bone/65 transition-colors hover:text-sun">
            Continue to briefing <ArrowDown aria-hidden className="size-3.5" />
          </Link>
        </div>
      </PageContainer>
    </section>
  );
}
