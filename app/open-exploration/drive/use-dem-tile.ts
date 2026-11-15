"use client";

import { useEffect, useState } from "react";
import { loadDemTile, type DemTile } from "@/integrations/terrain/dem-client";

type State = { key: string | null; tile: DemTile | null; error: string | null };

/** Measured elevation around a point; `null` coordinates leave the drive on procedural terrain. */
export function useDemTile(latDeg: number | null, lonDeg: number | null, radiusKm: number, size: number) {
  const key = latDeg === null || lonDeg === null ? null : `${latDeg.toFixed(4)}|${lonDeg.toFixed(4)}|${radiusKm}|${size}`;
  const [state, setState] = useState<State>({ key: null, tile: null, error: null });

  useEffect(() => {
    if (key === null || latDeg === null || lonDeg === null) return;
    let alive = true;
    loadDemTile(latDeg, lonDeg, radiusKm, size)
      .then((tile) => { if (alive) setState({ key, tile, error: null }); })
      .catch((error: unknown) => { if (alive) setState({ key, tile: null, error: error instanceof Error ? error.message : "Elevation data unavailable" }); });
    return () => { alive = false; };
    // The coordinates, radius and size are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { tile: null, loading: false, error: null };
  if (state.key !== key) return { tile: null, loading: true, error: null };
  return { tile: state.tile, loading: false, error: state.error };
}
