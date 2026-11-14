import type { Metadata } from "next";
import { Freeplay } from "./freeplay";

export const metadata: Metadata = {
  title: "Free Exploration",
  description: "Select lunar coordinates, control the simulation clock, and inspect a low-poly lunar environment.",
};

export default function ExplorePage() {
  return <Freeplay />;
}
