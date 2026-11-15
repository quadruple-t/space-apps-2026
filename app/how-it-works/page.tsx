import type { Metadata } from "next";
import { MissionControlContent } from "@/app/mission-control/page";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Explore the lunar science, data sources and methods behind Lunaris360.",
};

export default function HowItWorksPage() {
  return <MissionControlContent />;
}
