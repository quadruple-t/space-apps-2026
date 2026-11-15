/**
 * /api/v1/science/* handlers (see docs/API.md). Split out of app/api/v1/[[...path]]/route.ts so the
 * metrics, compare and rank paths share one implementation of location, horizon and sampling.
 *
 * Location rule: celestial, horizon, metrics, timeline and compare accept catalog sites only with a
 * verified point (lib/science/site-eligibility.ts). rank and composition also accept Artemis region
 * references through their representative point, and label every such result "approximate-region".
 */
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { errorJson, json } from "@/lib/api/http";
import { decodeFloat32, decodeInt16, decodeUint8 } from "@/lib/bytes";
import { decodeCellStats } from "@/lib/firestore/binary";
import { CartesianSeries, monthChunkIds, siteFrame, MAIN_SERIES_END, MAIN_SERIES_START } from "@/lib/ephemeris";
import { maskAt, maskFromGridCell, snapToGrid, smoothHorizonMask } from "@/lib/terrain";
import { longestRunHours, skyAt, skySamples, type HorizonProfile } from "@/lib/science/sky";
import { scienceEligibility } from "@/lib/science/site-eligibility";
import { compositionAt, decodeCompositionGrid, lowConfidenceOxides, type CompositionGrid, type OxideTable } from "@/lib/science/composition";
import { CRITERION_INFO, activeCriteria, parseWeights, rankSites, recommend, type RankInput } from "@/lib/science/rank";
import type { EphemerisChunk, HorizonMask } from "@/lib/model/types";

type Db = Firestore;
type Snap = FirebaseFirestore.DocumentSnapshot;

const HOUR_MS = 3_600_000;
const START_MS = Date.parse(MAIN_SERIES_START);
const END_MS = Date.parse(MAIN_SERIES_END);
/** Seasonal windows in /science/rank start this far apart (about three months). */
export const RANK_WINDOW_SPACING_HOURS = 2190;
export const RANK_MAX_SITES = 25;
const RANK_STEP_MINUTES = 20;
/** NASA HLS hazard threshold, dataSources/nasa-hls-2024: landing slope < 10° over 100 m. */
const HLS_SLOPE_LIMIT_DEG = 10;
const COMPOSITION_DOC = "compositionGrid/lp-grs-2deg";

export function validId(id: string) { return /^[a-zA-Z0-9_-]{1,120}$/.test(id); }

export function binary(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new Uint8Array(Buffer.from(value, "base64"));
  if (value && typeof value === "object" && "toUint8Array" in value && typeof value.toUint8Array === "function") return value.toUint8Array();
  throw new Error("Expected a Firestore binary value");
}

function ephemerisChunk(id: string, d: FirebaseFirestore.DocumentData): EphemerisChunk {
  return {
    id, startUtc: d.startUtc, stepMinutes: d.stepMinutes, count: d.count,
    layout: d.layout, data: decodeFloat32(binary(d.data)),
    sunAngularDiameterDegMean: d.sunAngularDiameterDegMean ?? null, frame: d.frame,
    timeScale: "UTC", source: "JPL Horizons API", horizonsQuery: d.horizonsQuery,
    ephemerisVersion: d.ephemerisVersion ?? null,
    retrievedAt: typeof d.retrievedAt?.toDate === "function" ? d.retrievedAt.toDate().toISOString() : d.retrievedAt,
  };
}

function horizonFromDoc(d: FirebaseFirestore.DocumentData): HorizonMask {
  return {
    source: "LOLA DEM", binDeg: Number(d.binDeg), maskElevationDeg: decodeFloat32(binary(d.mask)),
    maskP05Deg: d.maskP05 ? decodeFloat32(binary(d.maskP05)) : null,
    maskP95Deg: d.maskP95 ? decodeFloat32(binary(d.maskP95)) : null,
    maskSigmaDeg: d.maskSigma ? decodeFloat32(binary(d.maskSigma)) : null,
    errorMarginDeg: Number(d.errorMarginDeg), demProducts: d.demProducts ?? [],
    rayLengthKm: Number(d.rayLengthKm), observerHeightM: Number(d.observerHeightM),
  };
}

/** Ephemeris for [startMs, endMs], or null when a month chunk is missing. */
async function loadSeries(db: Db, startMs: number, endMs: number): Promise<CartesianSeries | null> {
  const chunkIds = monthChunkIds(new Date(startMs).toISOString(), new Date(endMs).toISOString()).filter((chunkId) => chunkId <= "2030-12");
  const snaps = await Promise.all(chunkIds.map((chunkId) => db.doc(`ephemerisGlobal/${chunkId}`).get()));
  if (snaps.some((snap) => !snap.exists)) return null;
  return new CartesianSeries(snaps.map((snap, index) => ephemerisChunk(chunkIds[index], snap.data()!)));
}

type Horizon = { mask: HorizonMask; horizonSource: string; slopeDeg: number | null; fromSiteMask: boolean };

/** Site LOLA mask, then the LOLA polar grid cell (south of 80°S), then the smooth-sphere horizon. */
async function loadHorizon(db: Db, terrainSnap: Snap | null, latitude: number, longitude: number): Promise<Horizon> {
  if (terrainSnap?.exists) {
    return { mask: horizonFromDoc(terrainSnap.data()!), horizonSource: "LOLA DEM", slopeDeg: terrainSnap.get("slope100mDeg") ?? null, fromSiteMask: true };
  }
  if (latitude <= -80) {
    const snap = snapToGrid(latitude, longitude);
    if (snap) {
      const tileSnap = await db.doc(`terrainGrid/${snap.tileId}`).get();
      if (tileSnap.exists) {
        const d = tileSnap.data()!;
        const cells = Number(d.cellsPerSide) ** 2;
        const bins = Number(d.bins);
        const tile = {
          id: snap.tileId, gridSpacingKm: Number(d.gridSpacingKm), tileOriginXY: d.tileOriginXY,
          cellsPerSide: Number(d.cellsPerSide), binDeg: Number(d.binDeg), bins,
          masks: decodeInt16(binary(d.masks)), maskErr: decodeUint8(binary(d.maskErr)),
          cellStats: decodeCellStats(binary(d.cellStats), decodeInt16(binary(d.masks)), bins, cells),
          demProducts: d.demProducts ?? [], rayLengthKm: Number(d.rayLengthKm), observerHeightM: Number(d.observerHeightM), computedAt: d.computedAt,
        };
        const gridMask = maskFromGridCell(tile, snap.cellIndex);
        if (gridMask) return { mask: gridMask, horizonSource: `LOLA DEM grid · ${snap.gridSpacingKm} km cell, ${snap.distanceKm.toFixed(1)} km from point`, slopeDeg: tile.cellStats[snap.cellIndex]?.slope100mDeg ?? null, fromSiteMask: false };
      }
    }
  }
  return { mask: smoothHorizonMask(), horizonSource: "none — smooth horizon", slopeDeg: null, fromSiteMask: false };
}

const profileOf = (mask: HorizonMask): HorizonProfile => ({ elevationsDeg: mask.source === "none" ? null : mask.maskElevationDeg, azimuthStepDeg: mask.binDeg });

type LocationQuality = "verified" | "approximate-region" | "custom";
type Resolved =
  | { ok: true; latDeg: number; lonDeg: number; quality: LocationQuality; siteSnap: Snap | null }
  | { ok: false; response: Response };

/** siteId (verified point; with allowApproximate also an Artemis representative point) or lat/lon. */
async function resolveLocation(db: Db, url: URL, allowApproximate: boolean): Promise<Resolved> {
  const siteId = url.searchParams.get("siteId");
  if (siteId === null) {
    const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 360) return { ok: false, response: errorJson("Provide a valid siteId or lat/lon coordinates") };
    return { ok: true, latDeg: lat, lonDeg: lon, quality: "custom", siteSnap: null };
  }
  if (!validId(siteId)) return { ok: false, response: errorJson("Invalid site id") };
  const siteSnap = await db.doc(`sites/${siteId}`).get();
  if (!siteSnap.exists) return { ok: false, response: errorJson("Site not found", 404) };
  const point = sitePoint(siteSnap.data(), allowApproximate);
  return point.ok ? { ok: true, latDeg: point.latDeg, lonDeg: point.lonDeg, quality: point.quality, siteSnap } : { ok: false, response: errorJson(point.reason, 422) };
}

type SitePoint = { ok: true; latDeg: number; lonDeg: number; quality: LocationQuality } | { ok: false; reason: string };
function sitePoint(data: FirebaseFirestore.DocumentData | undefined, allowApproximate: boolean): SitePoint {
  const eligibility = scienceEligibility(data);
  if (eligibility.ok) return { ok: true, latDeg: eligibility.latDeg, lonDeg: eligibility.lonDeg, quality: "verified" };
  const rep = data?.representativePoint as { latDeg?: unknown; lonDeg?: unknown } | null | undefined;
  const hasPoint = typeof data?.coordinates?.latDeg === "number";
  if (allowApproximate && !hasPoint && typeof rep?.latDeg === "number" && typeof rep?.lonDeg === "number") {
    return { ok: true, latDeg: rep.latDeg, lonDeg: rep.lonDeg, quality: "approximate-region" };
  }
  return { ok: false, reason: eligibility.reason };
}

function sampleWindow(series: CartesianSeries, latDeg: number, lonDeg: number, profile: HorizonProfile, startMs: number, endMs: number, stepMinutes: number) {
  const points = skySamples(series, siteFrame(latDeg, lonDeg), profile, startMs, endMs - 1, stepMinutes);
  const sunlit = points.map((p) => p.sunVisible), earthVisible = points.map((p) => p.earthVisible);
  const share = (flags: boolean[]) => flags.filter(Boolean).length / flags.length;
  return {
    sunShare: share(sunlit), earthShare: share(earthVisible),
    longestDarknessHours: longestRunHours(sunlit, false, stepMinutes / 60), longestBlackoutHours: longestRunHours(earthVisible, false, stepMinutes / 60),
  };
}

let compositionCache: { grid: CompositionGrid; loadedAt: number } | null = null;
async function loadComposition(db: Db): Promise<CompositionGrid | null> {
  if (compositionCache && Date.now() - compositionCache.loadedAt < 10 * 60_000) return compositionCache.grid;
  const snap = await db.doc(COMPOSITION_DOC).get();
  if (!snap.exists) return null;
  const grid = decodeCompositionGrid(snap.data()!, binary);
  compositionCache = { grid, loadedAt: Date.now() };
  return grid;
}

function coverageError() { return errorJson(`Stored JPL Horizons ephemeris covers ${MAIN_SERIES_START} through ${MAIN_SERIES_END}`, 422); }

export async function scienceGet(db: Db, id: string | undefined, url: URL): Promise<Response> {
  if (id === "compare") {
    const siteIds = (url.searchParams.get("siteIds") ?? "").split(",").filter(Boolean);
    if (siteIds.length < 2 || siteIds.length > 3 || siteIds.some((site) => !validId(site))) return errorJson("siteIds must contain two or three valid catalog ids");
    const calls = await Promise.all(siteIds.map(async (site) => {
      const next = new URL(url);
      next.searchParams.delete("siteIds");
      next.searchParams.set("siteId", site);
      const response = await scienceGet(db, "metrics", next);
      return { siteId: site, status: response.status, result: await response.json() };
    }));
    return json({ sites: calls, interval: { start: url.searchParams.get("start"), durationHours: url.searchParams.get("durationHours") ?? "24" } });
  }
  if (id === "rank") return rankGet(db, url);
  if (id === "composition") return compositionGet(db, url);
  if (!["celestial", "horizon", "metrics", "timeline"].includes(id ?? "")) return errorJson("Unknown science resource", 404);

  const siteId = url.searchParams.get("siteId");
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  if ((siteId === null && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 360))) return errorJson("Provide a valid siteId or lat/lon coordinates");
  const timestamp = url.searchParams.get("time") ?? url.searchParams.get("start") ?? (id === "horizon" ? MAIN_SERIES_START : null);
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return errorJson("Provide a valid ISO 8601 UTC time");
  const startMs = Date.parse(timestamp);
  const durationHours = Number(url.searchParams.get("durationHours") ?? 24);
  if (id === "metrics" && (!(durationHours > 0) || durationHours > 720)) return errorJson("durationHours must be greater than 0 and at most 720");
  const endMs = id === "metrics" || id === "timeline" ? startMs + (id === "timeline" ? 24 : durationHours) * HOUR_MS : startMs;
  const availableEndMs = id === "timeline" ? Math.min(endMs, END_MS) : endMs;
  if (startMs < START_MS || availableEndMs > END_MS || (id !== "timeline" && endMs > END_MS)) return coverageError();
  const stepMinutes = Number(url.searchParams.get("stepMinutes") ?? 1);
  if (id === "timeline" && (!Number.isInteger(stepMinutes) || stepMinutes < 1 || stepMinutes > 60)) return errorJson("stepMinutes must be an integer from 1 to 60");
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(availableEndMs).toISOString();

  // Catalog sites get "scientific" results only with a verified point coordinate (lib/science/site-eligibility.ts).
  const located = await resolveLocation(db, url, false);
  if (!located.ok) return located.response;
  const { latDeg: latitude, lonDeg: longitude, siteSnap } = located;
  const series = await loadSeries(db, startMs, availableEndMs);
  if (!series) return errorJson("Ephemeris data unavailable for this interval", 503);
  const terrainSnap = siteId ? await db.doc(`sites/${siteId}/terrain/v1`).get() : null;
  const { mask, horizonSource, slopeDeg, fromSiteMask } = await loadHorizon(db, terrainSnap, latitude, longitude);
  const elevationMeters: number | null = fromSiteMask ? siteSnap?.get("coordinates.elevationM") ?? null : null;
  const frame = siteFrame(latitude, longitude);
  // Shared with the client graphs: lib/science/sky.ts holds the one visibility implementation.
  const profile = profileOf(mask);
  const sky = (t: number) => skyAt(series, frame, profile, t);
  const bodies = (p: ReturnType<typeof sky>) => ({
    sun: { azimuthDeg: p.sunAz, elevationDeg: p.sunEl, visible: p.sunVisible },
    earth: { azimuthDeg: p.earthAz, elevationDeg: p.earthEl, visible: p.earthVisible },
  });
  if (id === "horizon") return mask.source === "none" ? json({ horizon: null, source: horizonSource, provenance: "scientific" }) : json({ horizon: { azimuthStepDeg: mask.binDeg, elevationsDeg: Array.from({ length: Math.round(360 / mask.binDeg) }, (_, i) => maskAt(mask.maskElevationDeg, mask.binDeg, i * mask.binDeg)), provenance: "scientific" }, source: horizonSource, provenance: "scientific" });
  if (id === "celestial") return json({ timestamp: fromIso, ...bodies(sky(startMs)), horizonSource, provenance: "scientific" });
  if (id === "timeline") {
    const samples = skySamples(series, frame, profile, startMs, availableEndMs, stepMinutes).map((p) => ({ timestamp: new Date(p.t).toISOString(), ...bodies(p) }));
    return json({ intervalStart: fromIso, intervalEnd: toIso, stepMinutes, horizonSource, samples, provenance: "scientific" });
  }
  const m = sampleWindow(series, latitude, longitude, profile, startMs, endMs, 10);
  const smooth = mask.source === "none";
  return json({
    sunlightPercent: Math.round(m.sunShare * 100), sunlightHours: Number((m.sunShare * durationHours).toFixed(1)),
    longestDarknessHours: m.longestDarknessHours, earthVisibilityPercent: Math.round(m.earthShare * 100),
    longestBlackoutHours: m.longestBlackoutHours, ...(slopeDeg !== null ? { slopeDeg } : {}), ...(elevationMeters !== null ? { elevationMeters } : {}),
    intervalStart: fromIso, intervalEnd: toIso, horizonSource,
    assumptions: ["10-minute sampling; run lengths limited to the interval", "Sun and Earth treated as points (centre of disk), no refraction", smooth ? "No terrain mask for this location: smooth-sphere horizon, so lit and visible shares are upper bounds" : "Terrain occlusion from the precomputed horizon mask"],
    provenance: "scientific",
  });
}

const COMPOSITION_ASSUMPTIONS = [
  "Regional average over a 2-degree equal-area pixel (about 60 km); not a measurement at this point",
  "Oxide weight percent from Lunar Prospector gamma-ray spectral unmixing; sigma is the 1-sigma propagated uncertainty",
  "Oxide abundances are not mineral identifications, ore grades or extraction yields",
];

async function compositionGet(db: Db, url: URL): Promise<Response> {
  const located = await resolveLocation(db, url, true);
  if (!located.ok) return located.response;
  const grid = await loadComposition(db);
  if (!grid) return errorJson("Composition data unavailable", 503);
  const hit = compositionAt(grid, located.latDeg, located.lonDeg);
  if (!hit) return errorJson("No composition pixel covers this location", 404);
  return json({
    latDeg: located.latDeg, lonDeg: located.lonDeg, locationQuality: located.quality,
    oxidesWtPct: hit.oxidesWtPct, sigmaWtPct: hit.sigmaWtPct, pixel: hit.pixel, resolutionKm: grid.resolutionKm,
    source: { id: "lp-grs-elem-abundance", product: grid.product, citation: grid.citation },
    assumptions: [...COMPOSITION_ASSUMPTIONS, ...grid.caveats.filter((c) => !c.startsWith("Regional averages"))],
    provenance: "scientific",
  });
}

type RankExtra = { siteId: string; name: string; family: string; latDeg: number; lonDeg: number; locationQuality: LocationQuality; horizonSource: string; insidePsr: boolean | null; compositionPixel: number | null; oxideSigmaWtPct: Pick<OxideTable, "FeO" | "TiO2" | "Al2O3" | "CaO"> | null };

async function rankGet(db: Db, url: URL): Promise<Response> {
  const start = url.searchParams.get("start");
  if (!start || Number.isNaN(Date.parse(start))) return errorJson("Provide a valid ISO 8601 UTC start");
  const startMs = Date.parse(start);
  const durationHours = Number(url.searchParams.get("durationHours") ?? 720);
  if (!(durationHours > 0) || durationHours > 720) return errorJson("durationHours must be greater than 0 and at most 720");
  const windows = Number(url.searchParams.get("windows") ?? 1);
  if (!Number.isInteger(windows) || windows < 1 || windows > 4) return errorJson("windows must be an integer from 1 to 4");
  const windowStarts = Array.from({ length: windows }, (_, i) => startMs + i * RANK_WINDOW_SPACING_HOURS * HOUR_MS);
  if (startMs < START_MS || windowStarts[windows - 1] + durationHours * HOUR_MS > END_MS) return coverageError();
  const parsed = parseWeights(url.searchParams.get("weights"));
  if (!parsed.ok) return errorJson(parsed.error);
  const weights = parsed.weights;
  const family = url.searchParams.get("family");
  const requested = url.searchParams.get("siteIds")?.split(",").filter(Boolean) ?? null;
  if (requested && (requested.length < 1 || requested.length > RANK_MAX_SITES || requested.some((s) => !validId(s)))) return errorJson(`siteIds must list 1 to ${RANK_MAX_SITES} valid catalog ids`);

  const indexSnap = await db.doc("catalog/siteIndex").get();
  const index = ((indexSnap.data()?.sites ?? []) as { id: string; family?: string }[])
    .filter((s) => (!family || s.family === family) && (!requested || requested.includes(s.id)));
  const unknown = requested?.filter((s) => !index.some((e) => e.id === s)) ?? [];

  const needsComposition = activeCriteria(weights).some((c) => ["iron", "titanium", "aluminium", "calcium"].includes(c));
  const [series, zonesSnap, grid] = await Promise.all([
    Promise.all(windowStarts.map((w) => loadSeries(db, w, w + durationHours * HOUR_MS))),
    db.collection("protectionZones").orderBy(FieldPath.documentId()).limit(250).get(),
    loadComposition(db).catch(() => null),
  ]);
  if (series.some((s) => s === null)) return errorJson("Ephemeris data unavailable for this interval", 503);
  const heritageSites = new Set(zonesSnap.docs.map((d) => d.data()).filter((z) => z.kind === "heritage-buffer").map((z) => String(z.siteId)));

  const skipped: { siteId: string; reason: string }[] = unknown.map((siteId) => ({ siteId, reason: "Not in the catalog" }));
  const inputs = (await Promise.all(index.map(async (entry): Promise<RankInput<RankExtra> | null> => {
    const [siteSnap, terrainSnap] = await Promise.all([db.doc(`sites/${entry.id}`).get(), db.doc(`sites/${entry.id}/terrain/v1`).get()]);
    const data = siteSnap.data();
    const point = sitePoint(data, true);
    if (!siteSnap.exists || !point.ok) { skipped.push({ siteId: entry.id, reason: point.ok ? "Site not found" : point.reason }); return null; }
    const horizon = await loadHorizon(db, terrainSnap, point.latDeg, point.lonDeg);
    const profile = profileOf(horizon.mask);
    const runs = series.map((s, i) => sampleWindow(s!, point.latDeg, point.lonDeg, profile, windowStarts[i], windowStarts[i] + durationHours * HOUR_MS, RANK_STEP_MINUTES));
    const ts = (data?.terrainSummary ?? {}) as { slope100mDeg?: number | null; nearestColdTrapKm?: number | null; insidePsr?: boolean | null };
    const slope = typeof ts.slope100mDeg === "number" ? ts.slope100mDeg : horizon.slopeDeg;
    const comp = grid ? compositionAt(grid, point.latDeg, point.lonDeg) : null;
    const flags: string[] = [];
    if (point.quality === "approximate-region") flags.push("approximate-region-point");
    if (horizon.mask.source === "none") flags.push("smooth-horizon-upper-bound");
    if (typeof slope === "number" && slope > HLS_SLOPE_LIMIT_DEG) flags.push("slope-over-hls-10deg");
    if (heritageSites.has(entry.id)) flags.push("heritage-protection-zone");
    if (data?.siteKind === "impact") flags.push("impact-site");
    if (ts.insidePsr === true) flags.push("inside-psr");
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      extra: { siteId: entry.id, name: String(data?.name ?? entry.id), family: String(data?.family ?? ""), latDeg: point.latDeg, lonDeg: point.lonDeg, locationQuality: point.quality, horizonSource: horizon.horizonSource, insidePsr: ts.insidePsr ?? null,
        compositionPixel: comp?.pixel.index ?? null,
        oxideSigmaWtPct: comp ? { FeO: comp.sigmaWtPct.FeO, TiO2: comp.sigmaWtPct.TiO2, Al2O3: comp.sigmaWtPct.Al2O3, CaO: comp.sigmaWtPct.CaO } : null },
      flags,
      measurements: {
        sunlightPercent: Math.round(mean(runs.map((r) => r.sunShare)) * 100),
        worstWindowSunlightPercent: Math.round(Math.min(...runs.map((r) => r.sunShare)) * 100),
        longestDarknessHours: Math.max(...runs.map((r) => r.longestDarknessHours)),
        earthVisibilityPercent: Math.round(mean(runs.map((r) => r.earthShare)) * 100),
        slope100mDeg: typeof slope === "number" ? Number(slope.toFixed(2)) : null,
        nearestColdTrapKm: typeof ts.nearestColdTrapKm === "number" ? Number(ts.nearestColdTrapKm.toFixed(2)) : null,
        feoWtPct: comp?.oxidesWtPct.FeO ?? null, tio2WtPct: comp?.oxidesWtPct.TiO2 ?? null,
        al2o3WtPct: comp?.oxidesWtPct.Al2O3 ?? null, caoWtPct: comp?.oxidesWtPct.CaO ?? null,
      },
    };
  }))).filter((x): x is RankInput<RankExtra> => x !== null);

  const ranked = rankSites(inputs, weights);
  // Oxide values below 2 sigma are noise; sites inside one 60 km pixel share a single value, not independent ones.
  const sites = ranked.map((r) => {
    const values = { FeO: r.feoWtPct ?? undefined, TiO2: r.tio2WtPct ?? undefined, Al2O3: r.al2o3WtPct ?? undefined, CaO: r.caoWtPct ?? undefined };
    const sharing = r.compositionPixel === null ? [] : ranked.filter((o) => o.siteId !== r.siteId && o.compositionPixel === r.compositionPixel).map((o) => o.siteId);
    return {
      ...r,
      oxidesLowConfidence: r.oxideSigmaWtPct ? lowConfidenceOxides(values, r.oxideSigmaWtPct) : [],
      sharesCompositionPixelWith: sharing.slice(0, 5),
    };
  });
  return json({
    interval: { start: new Date(startMs).toISOString(), durationHours, windows, windowStarts: windowStarts.map((w) => new Date(w).toISOString()) },
    weights,
    method: {
      normalisation: "Each criterion is min-max scaled across the candidates (1 = best, 0 = worst); score is the weighted mean. A criterion a site has no data for scores 0 and is flagged missing; weightCoverage is the share of weight with data.",
      criteria: Object.fromEntries(activeCriteria(weights).map((c) => [c, CRITERION_INFO[c].label])),
      slopeLimit: { deg: HLS_SLOPE_LIMIT_DEG, source: "NASA Artemis HLS update (2024): landing slope < 10° over 100 m" },
      sampling: `${RANK_STEP_MINUTES}-minute sampling; windows start ${RANK_WINDOW_SPACING_HOURS} h apart`,
    },
    count: sites.length,
    recommendation: recommend(sites),
    sites,
    skipped,
    assumptions: [
      "Sun and Earth treated as points (centre of disk), no refraction",
      "Approximate-region points are representative points for Artemis candidate regions, not verified sites",
      "Smooth-horizon sites have upper-bound sunlight and Earth-visibility shares",
      "recommendation is the best-ranked site without a heritage-zone, impact-site or over-10-degree-slope flag (and with enough data); oxidesLowConfidence lists oxides below 2 sigma of their uncertainty",
      "nearestColdTrapKm is a water-ice proxy (Diviner cold traps), only available for south polar sites",
      ...(needsComposition ? ["Oxide abundances are Lunar Prospector GRS regional averages over about 60 km pixels"] : []),
      ...(needsComposition && !grid ? ["Composition data was unavailable, so composition criteria are missing for every site"] : []),
    ],
    provenance: "scientific",
  });
}
