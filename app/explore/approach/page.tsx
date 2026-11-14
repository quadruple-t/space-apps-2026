import type { Metadata } from "next";
import { Suspense } from "react";
import { ApproachPlanner } from "./approach-planner";

export const metadata: Metadata = {
  title: "Approach Geometry",
  description: "Sun and Earth positions over a whole mission at a lunar site, with sunlight hours and solar intensity from JPL Horizons.",
};

export default function ApproachPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-void" />}>
    <ApproachPlanner />
  </Suspense>;
}
