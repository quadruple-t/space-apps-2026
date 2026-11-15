import type { Metadata } from "next";
import { FreeplayApp } from "./freeplay-app";

export const metadata: Metadata = {
  title: "Open Exploration",
  description: "Explore places on the Moon and see how sunlight and Earth visibility change over time.",
};

export default function FreeplayPage() {
  return <FreeplayApp />;
}
