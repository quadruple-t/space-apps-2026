import { ChallengeSection } from "@/components/landing/challenge-section";
import { ExperienceCards } from "@/components/landing/experience-cards";
import { FinalCTA } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { IntroductionSection } from "@/components/landing/introduction-section";
import { ScienceSection } from "@/components/landing/science-section";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ChallengeSection />
      <IntroductionSection />
      <ExperienceCards />
      <ScienceSection />
      <FinalCTA />
    </>
  );
}
