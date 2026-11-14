import type { Metadata } from "next";
import { GuidedMissionExperience } from "./guided-mission-experience";

export const metadata: Metadata = {
  title: "Tutorial",
  description: "Learn to read lunar terrain, lighting, Earth visibility, and mission windows inside the interactive Shadowline simulation.",
};

export default function MissionPage() {
  return <GuidedMissionExperience />;
}
