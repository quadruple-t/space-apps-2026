import type { Metadata } from "next";
import { GuidedMissionExperience } from "./guided-mission-experience";

export const metadata: Metadata = {
  title: "Story Mode",
  description: "Start with Apollo 11 in 1969. Learn through a lunar mission story, real examples, and simple guided actions.",
};

export default function MissionPage() {
  return <GuidedMissionExperience />;
}
