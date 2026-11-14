import type { Metadata } from "next";
import { FreeplayApp } from "./freeplay-app";

export const metadata: Metadata = {
  title: "Freeplay",
  description: "Pick a lunar landing site on a Moon globe with LRO overlays, then follow the Sun and Earth from that site over a mission with JPL Horizons ephemerides.",
};

export default function FreeplayPage() {
  return <FreeplayApp />;
}
