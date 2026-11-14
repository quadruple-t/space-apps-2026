import type { Metadata } from "next";
import { IntroductionSection } from "@/components/landing/introduction-section";
import { ScienceSection } from "@/components/landing/science-section";

export const metadata: Metadata = {
  title: "How It Works",
  description: "How Shadowline turns lunar terrain and Sun-Earth geometry into an explorable mission environment.",
};

export default function HowItWorksPage() {
  return (
    <>
      <IntroductionSection />
      <ScienceSection />
    </>
  );
}
