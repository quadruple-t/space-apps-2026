import type { EphemerisChunk, EphemerisSample, EphemerisSeries } from "@/lib/model/types";
import { CartesianSeries } from "./series";
import { azElFromCartesian, siteFrame, type AzEl } from "./topocentric";

export * from "./decode";
export * from "./series";
export * from "./topocentric";

/** Sun and Earth az/el at one instant from already-loaded chunks. */
export function computeTopocentricFromChunks(
  chunks: EphemerisChunk[],
  latDeg: number,
  lonDeg: number,
  timeIso: string,
  hKm = 0,
): { sun: AzEl; earth: AzEl } {
  const series = new CartesianSeries(chunks);
  const { sun, earth } = series.at(Date.parse(timeIso));
  const frame = siteFrame(latDeg, lonDeg, hKm);
  return { sun: azElFromCartesian(frame, sun), earth: azElFromCartesian(frame, earth) };
}

/** Build the engine's EphemerisSeries for a site over a window (stepMinutes ≥ 1). */
export function buildEphemerisSeries(
  series: CartesianSeries,
  latDeg: number,
  lonDeg: number,
  startIso: string,
  endIso: string,
  stepMinutes: number,
  hKm = 0,
): EphemerisSeries {
  if (!(stepMinutes >= 1)) throw new Error("stepMinutes must be ≥ 1");
  const frame = siteFrame(latDeg, lonDeg, hKm);
  const samples: EphemerisSample[] = [];
  const end = Date.parse(endIso);
  for (let t = Date.parse(startIso); t <= end; t += stepMinutes * 60_000) {
    const { sun, earth } = series.at(t);
    samples.push({
      time: new Date(t).toISOString(),
      sun: azElFromCartesian(frame, sun),
      earth: azElFromCartesian(frame, earth),
      sunDistKm: Math.hypot(...sun),
      earthDistKm: Math.hypot(...earth),
    });
  }
  return { source: "JPL Horizons (global sub-point series, client topocentric)", samples };
}
