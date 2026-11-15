"use client";

import { Check, X } from "lucide-react";
import { earthUp as isEarthUp, hoursUntilChange, sunUp as isSunUp, type Sample } from "@/lib/illumination";

const fmtH = (h: number | null) => (h === null ? "beyond window" : h < 1 ? `${Math.round(h * 60)} min` : h < 72 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

function Cell({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "sun" | "earth" }) {
  return <div className="hud-readout">
    <div className="hud-label">{tone === "sun" && <span className="text-retro-red">● </span>}{tone === "earth" && <span className="text-retro-blue">○ </span>}{label}</div>
    <div className="type-data mt-1 text-sm text-bone tabular-nums">{value}</div>
    {sub && <div className="type-data mt-0.5 text-[0.56rem] text-muted-foreground">{sub}</div>}
  </div>;
}

/** Current conditions at the site, read from the hourly series at fractional index `index`. */
export function ConditionsReadout({ samples, index, now }: { samples: Sample[]; index: number; now: Sample }) {
  const sunUp = isSunUp(now), earthUp = isEarthUp(now);
  const sunEl = now.sunEl, earthEl = now.earthEl;
  const horizonNote = (h: number) => (Math.abs(h) < 0.005 ? "" : ` · terrain ${h.toFixed(1)}°`);
  const toSun = hoursUntilChange(samples, index, 1, "sun");
  const toEarth = hoursUntilChange(samples, index, 1, "earth");
  return <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-4">
    <Cell tone="sun" label="Sun elevation" value={`${sunEl.toFixed(2)}°`} sub={`${sunUp ? "clear of horizon" : "below horizon"}${horizonNote(now.sunHorizon)}`} />
    <Cell tone="sun" label={sunUp ? "Until sunset" : "Until sunrise"} value={fmtH(toSun)} />
    <Cell tone="earth" label={earthUp ? "Until Earthset" : "Until Earthrise"} value={fmtH(toEarth)} />
    <Cell tone="earth" label="Earth visible" value={
      earthUp
        ? <span className="inline-flex items-center gap-1 text-[#3fd17a]"><Check size={14} aria-hidden />Yes</span>
        : <span className="inline-flex items-center gap-1 text-retro-red"><X size={14} aria-hidden />No</span>
    } sub={`elevation ${earthEl.toFixed(2)}°${horizonNote(now.earthHorizon)}`} />
  </div>;
}
