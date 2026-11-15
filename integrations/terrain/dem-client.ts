"use client";

import { base64ToU8 } from "@/lib/bytes";
import { decodeHeights, smoothToSourceResolution, type DemGrid } from "@/lib/terrain/dem";

export type DemTile = DemGrid & {
  center: { latDeg: number; lonDeg: number };
  radiusKm: number;
  centerM: number;
  source: { product: string; layer: string; service: string; nominalResolutionM: number; retrievedAt: string };
  notes: string[];
};

type DemResponse = Omit<DemTile, "heightsM" | "minM" | "maxM"> & {
  minM: number;
  maxM: number;
  heights: { encoding: string; data: string };
  error?: { message?: string };
};

const tiles = new Map<string, Promise<DemTile>>();

/** Site-centred elevation grid from /api/v1/terrain/dem (cached for the page's lifetime). */
export function loadDemTile(latDeg: number, lonDeg: number, radiusKm: number, size: number): Promise<DemTile> {
  const query = new URLSearchParams({ lat: latDeg.toFixed(4), lon: lonDeg.toFixed(4), radiusKm: String(Number(radiusKm.toPrecision(3))), size: String(size) });
  const key = query.toString();
  let pending = tiles.get(key);
  if (!pending) {
    pending = fetch(`/api/v1/terrain/dem?${key}`).then(async (response) => {
      const body = (await response.json()) as DemResponse;
      if (!response.ok) throw new Error(body.error?.message ?? `Elevation API returned ${response.status}`);
      if (body.heights.encoding !== "int16le-base64") throw new Error("Unsupported height encoding");
      const { heights, ...rest } = body;
      const heightsM = decodeHeights(base64ToU8(heights.data), body.size * body.size);
      smoothToSourceResolution(heightsM, body.size, body.spacingM);
      return { ...rest, heightsM };
    });
    pending.catch(() => tiles.delete(key));
    tiles.set(key, pending);
  }
  return pending;
}
