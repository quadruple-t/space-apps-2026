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
export function useEphemerisWindow(timeMs: number) {
  const [series, setSeries] = useState<CartesianSeries | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inStoredSeries = timeMs >= START_MS && timeMs <= END_MS;
  const nearEdge = !series || timeMs < series.startMs + 5 * DAY_MS || timeMs > series.endMs - 5 * DAY_MS;
  const wantMonth = inStoredSeries && nearEdge ? monthStart(timeMs) : null;
  const requestKey = wantMonth === null ? null : `${wantMonth}:${attempt}`;

  useEffect(() => {
    if (wantMonth === null) return;
    let alive = true;
    const start = Math.max(START_MS, Date.UTC(new Date(wantMonth).getUTCFullYear(), new Date(wantMonth).getUTCMonth() - 1, 1));
    const end = Math.min(END_MS, Date.UTC(new Date(wantMonth).getUTCFullYear(), new Date(wantMonth).getUTCMonth() + 3, 1) - 3_600_000);
    loadEphemeris(new Date(start).toISOString(), new Date(end).toISOString())
      .then((next) => { if (alive) { setSeries(next); setFailedKey(null); setLoadedKey(requestKey); } })
      .catch(() => { if (alive) setFailedKey(requestKey); });
    return () => { alive = false; };
  }, [wantMonth, requestKey]);

  return {
    series: series && series.covers(timeMs) ? series : null,
    loading: requestKey !== null && requestKey !== failedKey && requestKey !== loadedKey,
    error: !inStoredSeries ? "Outside the stored ephemeris range." : requestKey !== null && requestKey === failedKey ? "Could not load stored ephemeris." : null,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** Sun and Earth seen from the site at `timeMs`, or null when the series is missing or does not cover it. */
export function useLocalSky(series: CartesianSeries | null, latDeg: number, lonDeg: number, heightM: number, timeMs: number): LocalSky | null {
  const frame = useMemo(() => siteFrame(latDeg, lonDeg, heightM / 1000), [latDeg, lonDeg, heightM]);
  if (!series || !series.covers(timeMs)) return null;
  const { sun, earth } = series.at(timeMs);
  return { sun: azElFromCartesian(frame, sun), earth: azElFromCartesian(frame, earth), sunRangeAu: Math.hypot(...sun) / AU_KM };
}
