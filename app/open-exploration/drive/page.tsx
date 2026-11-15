import type { Metadata } from "next";
import { Suspense } from "react";
import { SurfaceDrive } from "./surface-drive";

export const metadata: Metadata = {
  title: "Open Exploration · Surface drive",
  description: "Drive across the lunar surface at the site and time chosen in Open Exploration.",
};

export default function SurfaceDrivePage() {
  return <Suspense fallback={<div className="h-dvh bg-void" />}>
    <SurfaceDrive />
  </Suspense>;
}
