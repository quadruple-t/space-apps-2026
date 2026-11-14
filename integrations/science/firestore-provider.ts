import "client-only";

import type { EphemerisChunk, HorizonMask } from "@/lib/model/types";
import { CartesianSeries, azElFromCartesian, monthChunkIds, siteFrame, MAIN_SERIES_END, MAIN_SERIES_START } from "@/lib/ephemeris";
import { getEphemerisChunk } from "@/lib/firestore/ephemerisService";
import { getSite } from "@/lib/firestore/sitesService";
import { getSiteTerrain } from "@/lib/firestore/terrainService";
import { getTerrainGridTile } from "@/lib/firestore/terrainGridService";
import { isAboveMask, maskAt, maskFromGridCell, smoothHorizonMask, snapToGrid, SMOOTH_HORIZON_LABEL } from "@/lib/terrain";
import type { CelestialState, HorizonProfile, LunarSite, MissionMetrics, ScienceProvider } from "./types";

const STEP_MINUTES = 10;
const HOUR_MS = 3_600_000;

type ResolvedHorizon = {
  mask: HorizonMask;
  label: string;
  slopeDeg: number | null;
  elevationMeters: number | null;
};

const seriesCache = new Map<string, Promise<CartesianSeries>>();
const horizonCache = new Map<string, Promise<ResolvedHorizon>>();

/** Contiguous month chunks → one CartesianSeries, memoised so playback does not re-decode every tick. */
function seriesFor(startMs: number, endMs: number): Promise<CartesianSeries> {
  if (startMs < Date.parse(MAIN_SERIES_START) || endMs > Date.parse(MAIN_SERIES_END)) {
    return Promise.reject(new RangeError(`Ephemeris covers ${MAIN_SERIES_START} to ${MAIN_SERIES_END}`));
  }
  const ids = monthChunkIds(new Date(startMs).toISOString(), new Date(endMs).toISOString()).filter((id) => id <= "2030-12");
  const key = ids.join(",");
  let hit = seriesCache.get(key);
  if (!hit) {
    hit = Promise.all(ids.map(getEphemerisChunk)).then((chunks: EphemerisChunk[]) => new CartesianSeries(chunks));
    seriesCache.set(key, hit);
    hit.catch(() => { if (seriesCache.get(key) === hit) seriesCache.delete(key); });
  }
  return hit;
}

/**
 * Horizon source, in order of authority:
 *  1. curated library site (provenance "scientific") with a precomputed LOLA mask,
 *  2. south-polar LOLA grid cell (80–90°S),
 *  3. smooth-sphere horizon, labelled as such, never presented as terrain.
 */
function resolveHorizon(site: LunarSite): Promise<ResolvedHorizon> {
  const key = `${site.id}:${site.latitudeDeg.toFixed(4)}:${site.longitudeDeg.toFixed(4)}`;
  let hit = horizonCache.get(key);
  if (!hit) {
    hit = loadHorizon(site);
    horizonCache.set(key, hit);
    hit.catch(() => { if (horizonCache.get(key) === hit) horizonCache.delete(key); });
  }
  return hit;
}

async function loadHorizon(site: LunarSite): Promise<ResolvedHorizon> {
  if (site.provenance === "scientific") {
    const [terrain, detail] = await Promise.all([getSiteTerrain(site.id), getSite(site.id)]);
    if (terrain) {
      return {
        mask: terrain.mask,
        label: terrain.mask.source === "none" ? SMOOTH_HORIZON_LABEL : terrain.mask.source,
        slopeDeg: terrain.slope100mDeg,
        elevationMeters: detail?.coordinates?.elevationM ?? null,
      };
    }
  }
  const snap = snapToGrid(site.latitudeDeg, site.longitudeDeg);
  if (snap) {
    const tile = await getTerrainGridTile(snap.tileId);
    const mask = tile ? maskFromGridCell(tile, snap.cellIndex) : null;
    if (tile && mask) {
      return {
        mask,
        label: `LOLA DEM grid · ${snap.gridSpacingKm} km cell, ${snap.distanceKm.toFixed(1)} km from point`,
        slopeDeg: tile.cellStats[snap.cellIndex]?.slope100mDeg ?? null,
        elevationMeters: null,
      };
    }
  }
  return { mask: smoothHorizonMask(), label: SMOOTH_HORIZON_LABEL, slopeDeg: null, elevationMeters: null };
}

function longestRun(flags: boolean[], want: boolean, stepHours: number): number {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f === want ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best * stepHours;
}

/** Firestore-backed provider: JPL Horizons ephemeris chunks plus precomputed LOLA horizon masks. */
export const firestoreScienceProvider: ScienceProvider = {
  provenance: "scientific",

  async getCelestialState(site: LunarSite, timestamp: string): Promise<CelestialState> {
    const t = Date.parse(timestamp);
    if (Number.isNaN(t)) throw new Error(`Invalid timestamp "${timestamp}"`);
    const [series, horizon] = await Promise.all([seriesFor(t, t), resolveHorizon(site)]);
    const { sun, earth } = series.at(t);
    const frame = siteFrame(site.latitudeDeg, site.longitudeDeg);
    const sunAe = azElFromCartesian(frame, sun);
    const earthAe = azElFromCartesian(frame, earth);
    return {
      timestamp,
      sun: { ...sunAe, visible: isAboveMask(horizon.mask, sunAe.azimuthDeg, sunAe.elevationDeg) },
      earth: { ...earthAe, visible: isAboveMask(horizon.mask, earthAe.azimuthDeg, earthAe.elevationDeg) },
      provenance: "scientific",
    };
  },

  async getHorizon(site: LunarSite): Promise<HorizonProfile | null> {
    const { mask } = await resolveHorizon(site);
    if (mask.source === "none") return null;
    const step = mask.binDeg;
    const elevationsDeg: number[] = [];
    for (let az = 0; az < 360; az += step) elevationsDeg.push(maskAt(mask.maskElevationDeg, mask.binDeg, az));
    return { azimuthStepDeg: step, elevationsDeg, provenance: "scientific" };
  },

  async getMissionMetrics(site: LunarSite, start: string, durationHours: number): Promise<MissionMetrics | null> {
    const startMs = Date.parse(start);
    if (Number.isNaN(startMs) || !(durationHours > 0)) throw new Error("Invalid mission interval");
    const endMs = startMs + durationHours * HOUR_MS;
    const [series, horizon] = await Promise.all([seriesFor(startMs, endMs), resolveHorizon(site)]);
    const frame = siteFrame(site.latitudeDeg, site.longitudeDeg);
    const lit: boolean[] = [];
    const comms: boolean[] = [];
    for (let t = startMs; t < endMs; t += STEP_MINUTES * 60_000) {
      const { sun, earth } = series.at(t);
      const s = azElFromCartesian(frame, sun);
      const e = azElFromCartesian(frame, earth);
      lit.push(isAboveMask(horizon.mask, s.azimuthDeg, s.elevationDeg));
      comms.push(isAboveMask(horizon.mask, e.azimuthDeg, e.elevationDeg));
    }
    const stepHours = STEP_MINUTES / 60;
    const share = (flags: boolean[]) => flags.filter(Boolean).length / flags.length;
    const smooth = horizon.mask.source === "none";
    return {
      sunlightPercent: Math.round(share(lit) * 100),
      sunlightHours: Number((share(lit) * durationHours).toFixed(1)),
      longestDarknessHours: Number(longestRun(lit, false, stepHours).toFixed(1)),
      earthVisibilityPercent: Math.round(share(comms) * 100),
      longestBlackoutHours: Number(longestRun(comms, false, stepHours).toFixed(1)),
      ...(horizon.elevationMeters !== null ? { elevationMeters: horizon.elevationMeters } : {}),
      ...(horizon.slopeDeg !== null ? { slopeDeg: horizon.slopeDeg } : {}),
      intervalStart: new Date(startMs).toISOString(),
      intervalEnd: new Date(endMs).toISOString(),
      horizonSource: horizon.label,
      assumptions: [
        `${STEP_MINUTES}-minute sampling; run lengths are limited to the interval`,
        "Sun and Earth treated as points (centre of disk), no refraction",
        smooth ? "No terrain mask for this location: smooth-sphere horizon, so lit and visible shares are upper bounds" : "Terrain occlusion from the precomputed horizon mask",
      ],
      provenance: "scientific",
    };
  },
};
