"use client";

import { Check, X } from "lucide-react";
import { earthUp as isEarthUp, hoursUntilChange, SOLAR_CONSTANT_W_M2, sunUp as isSunUp, type Sample } from "@/lib/illumination";
import { useFreeplay } from "@/lib/freeplay-store";
import type { GraphFocus } from "./graphs-panel";

const fmtH = (h: number | null) => (h === null ? "beyond window" : h < 1 ? `${Math.round(h * 60)} min` : h < 72 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

function Cell({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "sun" | "earth" }) {
  return <div className="hud-readout">
    <div className="text-sm font-medium text-muted-foreground">{tone === "sun" && <span className="text-retro-red">● </span>}{tone === "earth" && <span className="text-retro-blue">● </span>}{label}</div>
    <div className="type-data mt-1 text-base text-bone tabular-nums">{value}</div>
    {sub && <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{sub}</div>}
  </div>;
}

/** Current conditions at the site, read from the hourly series at fractional index `index`. */
export function ConditionsReadout({ samples, index, now, focus }: { samples: Sample[]; index: number; now: Sample; focus: GraphFocus }) {
  const sunUp = isSunUp(now), earthUp = isEarthUp(now);
  const sunEl = now.sunEl, earthEl = now.earthEl;
  const area = useFreeplay((state) => state.panelAreaM2);
  const efficiency = useFreeplay((state) => state.panelEfficiency);
  const toSun = hoursUntilChange(samples, index, 1, "sun");
  const toEarth = hoursUntilChange(samples, index, 1, "earth");
  const powerW = sunUp ? area * efficiency * SOLAR_CONSTANT_W_M2 * Math.sin((sunEl * Math.PI) / 180) : 0;
  const visible = (shown: boolean) => shown
    ? <span className="inline-flex items-center gap-1 text-[#3fd17a]"><Check size={16} aria-hidden />Yes</span>
    : <span className="inline-flex items-center gap-1 text-retro-red"><X size={16} aria-hidden />No</span>;

  if (focus === "earth") return <div className="mb-4 grid grid-cols-2 gap-2">
    <Cell tone="earth" label="Can this site see Earth?" value={visible(earthUp)} sub={`Earth is ${earthEl.toFixed(1)}° ${earthEl >= 0 ? "above" : "below"} the horizon.`} />
    <Cell tone="earth" label={earthUp ? "Earth sets in" : "Earth rises in"} value={fmtH(toEarth)} />
  </div>;

  if (focus === "power") return <div className="mb-4 grid grid-cols-2 gap-2">
    <Cell tone="sun" label="Estimated solar power" value={`${powerW.toFixed(0)} W`} sub={`${area} m² panel · ${Math.round(efficiency * 100)}% efficiency`} />
    <Cell tone="sun" label="Is sunlight reaching the site?" value={visible(sunUp)} sub={`Sun is ${sunEl.toFixed(1)}° ${sunEl >= 0 ? "above" : "below"} the horizon.`} />
  </div>;

  return <div className="mb-4 grid grid-cols-2 gap-2">
    <Cell tone="sun" label="Is sunlight reaching the site?" value={visible(sunUp)} sub={`Sun is ${sunEl.toFixed(1)}° ${sunEl >= 0 ? "above" : "below"} the horizon.`} />
    <Cell tone="sun" label={sunUp ? "Sun sets in" : "Sun rises in"} value={fmtH(toSun)} />
  </div>;
}
