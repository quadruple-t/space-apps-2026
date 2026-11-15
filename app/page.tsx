import { ChallengeSection } from "@/components/landing/challenge-section";
import { ExperienceCards } from "@/components/landing/experience-cards";
import { FinalCTA } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { ScrollConstellation } from "@/components/landing/scroll-constellation";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ChallengeSection />
      <ExperienceCards />
      <FinalCTA />
      <ScrollConstellation />
    </>
  );
}
