import type { Metadata } from "next";
import { SurfaceDrive } from "./surface-drive";

export const metadata: Metadata = {
  title: "Freeplay · Surface drive",
  description: "Select lunar coordinates, control the simulation clock, and drive across a low-poly lunar environment.",
};

export default function SurfaceDrivePage() {
  return <SurfaceDrive />;
}
