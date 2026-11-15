/**
 * Regional oxide abundances from the Lunar Prospector GRS 2-degree equal-area product
 * (compositionGrid/lp-grs-2deg, written by scripts/data-pipeline/45_composition.py).
 *
 * Values are averages over pixels about 60 km across, so they describe the region around a point,
 * never the point itself. This module only decodes and looks up the stored numbers; interpreting
 * them as minerals or resources is left to the reader, labelled as an estimate.
 */
import { decodeInt16, toU8, type BytesLike } from "@/lib/bytes";

export const COMPOSITION_OXIDES = ["FeO", "TiO2", "Al2O3", "CaO", "MgO", "SiO2"] as const;
export type Oxide = (typeof COMPOSITION_OXIDES)[number];
export type OxideTable = Record<Oxide, number>;

export type CompositionGrid = {
  count: number;
  oxides: string[];
  /** [minLat, maxLat, minLon, maxLon] x count, degrees x 10, longitude east in -180..180. */
  bounds: Int16Array;
  /** wt% x 100, per pixel in `oxides` order. */
  values: Uint16Array;
  sigma: Uint16Array;
  pixelDeg: number;
  resolutionKm: number;
  product: string;
  citation: string;
  caveats: string[];
};

export type CompositionLookup = {
  oxidesWtPct: OxideTable;
  sigmaWtPct: OxideTable;
  pixel: { index: number; centerLatDeg: number; centerLonDeg: number; sizeDeg: number; distanceKm: number };
};

const MOON_RADIUS_KM = 1737.4;

function decodeUint16(b: BytesLike): Uint16Array {
  const i16 = decodeInt16(b);
  return new Uint16Array(i16.buffer, i16.byteOffset, i16.length);
}

/** Decodes the stored document. Throws when the byte lengths do not match the declared count. */
export function decodeCompositionGrid(d: Record<string, unknown>, bytes: (v: unknown) => BytesLike = (v) => v as BytesLike): CompositionGrid {
  const count = Number(d.count);
  const oxides = Array.isArray(d.oxides) ? d.oxides.map(String) : [];
  const bounds = decodeInt16(bytes(d.bounds));
  const values = decodeUint16(bytes(d.values));
  const sigma = decodeUint16(bytes(d.sigma));
  if (!Number.isInteger(count) || count <= 0 || bounds.length !== count * 4 || values.length !== count * oxides.length || sigma.length !== values.length) {
    throw new Error(`compositionGrid payload does not match count ${count} (${toU8(bytes(d.bounds)).byteLength} bound bytes)`);
  }
  for (const o of COMPOSITION_OXIDES) if (!oxides.includes(o)) throw new Error(`compositionGrid is missing ${o}`);
  return {
    count, oxides, bounds, values, sigma,
    pixelDeg: Number(d.pixelDeg) || 2, resolutionKm: Number(d.resolutionKm) || 60,
    product: String(d.product ?? "Lunar Prospector GRS elemental abundance"), citation: String(d.citation ?? ""),
    caveats: Array.isArray(d.caveats) ? d.caveats.map(String) : [],
  };
}

/** A value closer to zero than this many sigma is not distinguishable from noise. */
export const NOISE_SIGMAS = 2;

/** Oxides whose abundance is below NOISE_SIGMAS x its 1-sigma uncertainty, so it should not be quoted as a measurement. */
export function lowConfidenceOxides(values: Partial<OxideTable>, sigma: Partial<OxideTable>): Oxide[] {
  return COMPOSITION_OXIDES.filter((o) => typeof values[o] === "number" && typeof sigma[o] === "number" && values[o]! < NOISE_SIGMAS * sigma[o]!);
}

const toEast180 = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function surfaceDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Pixel containing the point (longitude accepted in -180..360). Null only if the grid has a gap there. */
export function compositionAt(grid: CompositionGrid, latDeg: number, lonDeg: number): CompositionLookup | null {
  const lat = latDeg * 10, lon = toEast180(lonDeg) * 10;
  const n = grid.oxides.length;
  for (let i = 0; i < grid.count; i++) {
    const b = i * 4;
    const minLat = grid.bounds[b], maxLat = grid.bounds[b + 1], minLon = grid.bounds[b + 2], maxLon = grid.bounds[b + 3];
    const inLat = lat >= minLat && (lat < maxLat || (maxLat === 900 && lat <= 900));
    // -180 and 180 are the same meridian: either edge pixel may claim it.
    const inLon = (lon >= minLon && lon < maxLon) || (maxLon === 1800 && Math.abs(lon) === 1800);
    if (!inLat || !inLon) continue;
    const oxidesWtPct = {} as OxideTable, sigmaWtPct = {} as OxideTable;
    for (const o of COMPOSITION_OXIDES) {
      const j = grid.oxides.indexOf(o);
      oxidesWtPct[o] = grid.values[i * n + j] / 100;
      sigmaWtPct[o] = grid.sigma[i * n + j] / 100;
    }
    const centerLatDeg = (minLat + maxLat) / 20, centerLonDeg = (minLon + maxLon) / 20;
    return {
      oxidesWtPct, sigmaWtPct,
      pixel: { index: i, centerLatDeg, centerLonDeg, sizeDeg: grid.pixelDeg, distanceKm: Number(surfaceDistanceKm(latDeg, lonDeg, centerLatDeg, centerLonDeg).toFixed(1)) },
    };
  }
  return null;
}
