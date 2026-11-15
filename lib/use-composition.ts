"use client";

import { useEffect, useState } from "react";
import type { SiteRef } from "@/lib/lunar-data";
import { COMPOSITION_OXIDES, type OxideTable } from "@/lib/science/composition";

export type CompositionStats = { oxidesWtPct: OxideTable; sigmaWtPct: OxideTable; resolutionKm: number };
const cache = new Map<string, Promise<CompositionStats | null>>();

function isOxideTable(value: unknown): value is OxideTable {
  return typeof value === "object" && value !== null && COMPOSITION_OXIDES.every((oxide) =>
    typeof (value as Record<string, unknown>)[oxide] === "number" && Number.isFinite((value as Record<string, number>)[oxide]));
}

export function fetchComposition(site: SiteRef): Promise<CompositionStats | null> {
  const key = `${site.latitudeDeg}|${site.longitudeDeg}`;
  let request = cache.get(key);
  if (!request) {
    const params = new URLSearchParams({ lat: String(site.latitudeDeg), lon: String(site.longitudeDeg) });
    request = fetch(`/api/v1/science/composition?${params}`).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Composition data unavailable (${response.status})`);
      const body = await response.json() as Partial<CompositionStats>;
      if (!isOxideTable(body.oxidesWtPct) || !isOxideTable(body.sigmaWtPct) || typeof body.resolutionKm !== "number") throw new Error("Invalid composition data");
      return { oxidesWtPct: body.oxidesWtPct, sigmaWtPct: body.sigmaWtPct, resolutionKm: body.resolutionKm };
    });
    cache.set(key, request);
    request.catch(() => { if (cache.get(key) === request) cache.delete(key); });
  }
  return request;
}

/** Fetch regional oxide measurements only when a comparison row needs them. */
export function useComposition(site: SiteRef | null, enabled: boolean) {
  const key = site && enabled ? `${site.latitudeDeg}|${site.longitudeDeg}` : null;
  const [attempt, setAttempt] = useState(0);
  const tag = key ? `${key}|${attempt}` : null;
  const [state, setState] = useState<{ tag: string | null; data: CompositionStats | null; error: string | null }>({ tag: null, data: null, error: null });
  useEffect(() => {
    if (!tag || !site) return;
    let alive = true;
    fetchComposition(site).then((data) => { if (alive) setState({ tag, data, error: null }); })
      .catch((error: unknown) => { if (alive) setState({ tag, data: null, error: error instanceof Error ? error.message : "Composition data unavailable" }); });
    return () => { alive = false; };
    // Coordinates and retry count are folded into tag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);
  const loading = !!tag && state.tag !== tag;
  return { data: loading || !tag ? null : state.data, loading, error: loading || !tag ? null : state.error, retry: () => setAttempt((n) => n + 1) };
}
