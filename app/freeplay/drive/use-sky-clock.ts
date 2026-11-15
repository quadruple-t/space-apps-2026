"use client";

import { useEffect, useMemo, useState } from "react";
import { azElFromCartesian, siteFrame, type AzEl, type CartesianSeries } from "@/lib/ephemeris";
import { loadEphemeris, MAIN_SERIES_END, MAIN_SERIES_START } from "@/lib/lunar-data";
import { AU_KM } from "@/lib/science/sky";

const DAY_MS = 86_400_000;
const START_MS = Date.parse(MAIN_SERIES_START);
const END_MS = Date.parse(MAIN_SERIES_END);
const monthStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

export type LocalSky = { sun: AzEl; earth: AzEl; sunRangeAu: number };

/**
 * Stored JPL Horizons chunks around the playback time, decoded in the browser (the same
 * modules the science API uses), so fast playback can place the Sun and Earth every frame
 * without an API round trip. Keeps the current window until the next one has loaded.
 */
export function useEphemerisWindow(timeMs: number): CartesianSeries | null {
  const [series, setSeries] = useState<CartesianSeries | null>(null);
  const inStoredSeries = timeMs >= START_MS && timeMs <= END_MS;
  const nearEdge = !series || timeMs < series.startMs + 5 * DAY_MS || timeMs > series.endMs - 5 * DAY_MS;
  const wantMonth = inStoredSeries && nearEdge ? monthStart(timeMs) : null;

  useEffect(() => {
    if (wantMonth === null) return;
    let alive = true;
    const start = Math.max(START_MS, Date.UTC(new Date(wantMonth).getUTCFullYear(), new Date(wantMonth).getUTCMonth() - 1, 1));
    const end = Math.min(END_MS, Date.UTC(new Date(wantMonth).getUTCFullYear(), new Date(wantMonth).getUTCMonth() + 3, 1) - 3_600_000);
    loadEphemeris(new Date(start).toISOString(), new Date(end).toISOString())
      .then((next) => { if (alive) setSeries(next); })
      .catch(() => { /* the caller falls back to the science API */ });
    return () => { alive = false; };
  }, [wantMonth]);

  return series && series.covers(timeMs) ? series : null;
}

/** Sun and Earth seen from the site at `timeMs`, or null when the stored series does not cover it. */
export function useLocalSky(latDeg: number, lonDeg: number, heightM: number, timeMs: number): LocalSky | null {
  const series = useEphemerisWindow(timeMs);
  const frame = useMemo(() => siteFrame(latDeg, lonDeg, heightM / 1000), [latDeg, lonDeg, heightM]);
  if (!series) return null;
  const { sun, earth } = series.at(timeMs);
  return { sun: azElFromCartesian(frame, sun), earth: azElFromCartesian(frame, earth), sunRangeAu: Math.hypot(...sun) / AU_KM };
}
