import type { Metadata } from "next";
import { GuidedMissionExperience } from "./guided-mission-experience";

export const metadata: Metadata = {
  title: "Guided Mission",
  description: "Follow Lunaris360's three-act Guided Mission from Apollo landing decisions through robotic exploration to a potential mining lunar base.",
};

export default function MissionPage() {
  return <GuidedMissionExperience />;
}
