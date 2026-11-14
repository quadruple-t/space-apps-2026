import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { LunarSceneLoader } from "@/scenes/lunar/lunar-scene-loader";
import { HeroHud } from "./hero-hud";

const delay = (name: string, ms: number) => ({ [name]: `${ms}ms` }) as React.CSSProperties;

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <LunarSceneLoader variant="hero" />
        {/* Legibility scrims — anchor the type to the shadowed foreground. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void from-5% via-void/60 via-40% to-transparent to-70%" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-void/70 to-transparent" />
      </div>

      <PageContainer className="relative flex flex-1 flex-col justify-end pb-8 pt-28 sm:pb-10">
        <h1 id="hero-title" className="type-display text-[clamp(2.6rem,7vw,6.75rem)] text-bone">
          <span className="hero-line" style={delay("--line-delay", 120)}>
            Beyond the
          </span>
          <span className="hero-line" style={delay("--line-delay", 260)}>
            horizon.
          </span>
        </h1>

        <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,34rem)_minmax(0,32rem)] lg:items-end lg:justify-between">
          <div className="hud-enter" style={delay("--hud-delay", 620)}>
            <p className="text-xl font-medium text-bone sm:text-2xl">Where lunar exploration meets mission intelligence.</p>
            <p className="mt-4 text-pretty text-base leading-relaxed text-bone/75 sm:text-lg">
              Explore the Moon&apos;s south pole, visualize the Sun and Earth&apos;s position against its unforgiving
              terrain, and discover the conditions that shape the next generation of lunar missions.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl">
                <Link href="#explore">Explore Lunaris360</Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="#mission">Discover the Mission</Link>
              </Button>
            </div>
          </div>

          <HeroHud />
        </div>

        <p
          className="hud-enter type-data mt-10 border-t border-bone/15 pt-4 text-[0.7rem] leading-relaxed text-bone/60"
          style={delay("--hud-delay", 1400)}
        >
          Conceptual preview. Procedurally generated terrain and illustrative values, not mission telemetry or
          LOLA-derived data.
        </p>
      </PageContainer>
    </section>
  );
}
