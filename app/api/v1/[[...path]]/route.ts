import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminCredentialsRequired, adminDb, hasAdminCredentials, verifyFirebaseToken } from "@/lib/firebase/admin";
import { publicReadDb } from "@/lib/firebase/public-read-db";
import { errorJson, json, serialize } from "@/lib/api/http";
import { decodeFloat32, decodeInt16, decodeUint8 } from "@/lib/bytes";
import { decodeCellStats } from "@/lib/firestore/binary";
import { CartesianSeries, monthChunkIds, siteFrame, MAIN_SERIES_END, MAIN_SERIES_START } from "@/lib/ephemeris";
import { maskAt, maskFromGridCell, snapToGrid, smoothHorizonMask } from "@/lib/terrain";
import { longestRunHours, skyAt, skySamples, type HorizonProfile } from "@/lib/science/sky";
import { scienceEligibility } from "@/lib/science/site-eligibility";
import type { EphemerisChunk, HorizonMask } from "@/lib/model/types";

const PUBLIC_COLLECTIONS: Record<string, string> = {
  sites: "sites", chapters: "storyChapters", profiles: "missionProfiles", zones: "protectionZones",
  presets: "landerPresets", facts: "facts", validations: "validationChecks", sources: "dataSources",
  ephemeris: "ephemerisGlobal", terrain: "terrainGrid", psr: "psrLayer", demos: "demo",
};
const SUBCOLLECTIONS = new Set(["sessions", "reports", "progress"]);
const MAX_LIMIT = 250;

function validId(id: string) { return /^[a-zA-Z0-9_-]{1,120}$/.test(id); }
function docValue(snap: FirebaseFirestore.DocumentSnapshot) {
  return snap.exists ? { id: snap.id, ...(serialize(snap.data()) as Record<string, unknown>) } : null;
}
function binary(value: unknown): Uint8Array {
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
function validateSelection(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  if (x.kind === "library") return typeof x.siteId === "string" && validId(x.siteId);
  if (x.kind === "custom") {
    const c = x.coordinates as Record<string, unknown> | undefined;
    return typeof x.label === "string" && x.label.length <= 120 && !!c && Number.isFinite(c.latDeg) && Number.isFinite(c.lonDeg)
      && Number(c.latDeg) >= -90 && Number(c.latDeg) <= 90 && Number(c.lonDeg) >= -180 && Number(c.lonDeg) <= 360;
  }
  return false;
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  try {
    const { path = [] } = await context.params;
    const [root, id, child, childId] = path;
    const url = new URL(request.url);

    if (path.length === 0 || root === "manifest") return json({ version: "v1", basePath: "/api/v1", resources: ["catalog/sites", "catalog/meta", "science/celestial", "science/horizon", "science/metrics", "science/compare", "science/timeline", ...Object.keys(PUBLIC_COLLECTIONS), "users/{uid}/sessions", "users/{uid}/reports", "users/{uid}/progress"] });
    if (root === "users" && !hasAdminCredentials()) return adminCredentialsRequired();
    // Public endpoints use the Web SDK and public Firestore rules. This avoids making
    // catalog/science reads depend on a local service-account key or ADC configuration.
    const db = root === "users" ? adminDb() : publicReadDb();
    if (root === "catalog") {
      if (id === "sites" && !child) {
        const snap = await db.doc("catalog/siteIndex").get();
        if (!snap.exists) return json({ sites: [], count: 0 });
        const data = snap.data() ?? {};
        const sites = (data.sites as Record<string, unknown>[] ?? []).filter((site) => {
          const family = url.searchParams.get("family");
          const query = url.searchParams.get("q")?.toLowerCase();
          return (!family || site.family === family) && (!query || String(site.name ?? "").toLowerCase().includes(query) || String(site.mission ?? "").toLowerCase().includes(query));
        });
        return json({ sites, count: sites.length, generatedAt: data.generatedAt ?? null });
      }
      if (id === "sites" && child && !childId) {
        if (!validId(child)) return errorJson("Invalid site id", 400);
        const [site, terrain] = await Promise.all([
          db.doc(`sites/${child}`).get(), db.doc(`sites/${child}/terrain/v1`).get(),
        ]);
        return site.exists ? json({ site: docValue(site), terrain: docValue(terrain) }) : errorJson("Site not found", 404);
      }
      if (id === "meta") {
        const snap = await db.doc("catalog/meta").get();
        return snap.exists ? json(serialize(snap.data())) : errorJson("Catalog metadata not found", 404);
      }
    }

    if (root === "science") {
      if (id === "compare") {
        const siteIds = (url.searchParams.get("siteIds") ?? "").split(",").filter(Boolean);
        if (siteIds.length < 2 || siteIds.length > 3 || siteIds.some((site) => !validId(site))) return errorJson("siteIds must contain two or three valid catalog ids");
        const calls: { siteId: string; status: number; result: unknown }[] = await Promise.all(siteIds.map(async (site) => {
          const next = new URL(request.url);
          next.pathname = "/api/v1/science/metrics";
          next.searchParams.delete("siteIds");
          next.searchParams.set("siteId", site);
          const response: Response = await GET(new Request(next, { headers: request.headers }), { params: Promise.resolve({ path: ["science", "metrics"] }) });
          return { siteId: site, status: response.status, result: await response.json() };
        }));
        return json({ sites: calls, interval: { start: url.searchParams.get("start"), durationHours: url.searchParams.get("durationHours") ?? "24" } });
      }
      if (!["celestial", "horizon", "metrics", "timeline"].includes(id ?? "")) return errorJson("Unknown science resource", 404);
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const siteId = url.searchParams.get("siteId");
      if ((siteId === null && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 360))) return errorJson("Provide a valid siteId or lat/lon coordinates");
      const timestamp = url.searchParams.get("time") ?? url.searchParams.get("start") ?? (id === "horizon" ? MAIN_SERIES_START : null);
      if (!timestamp || Number.isNaN(Date.parse(timestamp))) return errorJson("Provide a valid ISO 8601 UTC time");
      const startMs = Date.parse(timestamp);
      const durationHours = Number(url.searchParams.get("durationHours") ?? 24);
      if (id === "metrics" && (!(durationHours > 0) || durationHours > 720)) return errorJson("durationHours must be greater than 0 and at most 720");
      const endMs = id === "metrics" || id === "timeline" ? startMs + (id === "timeline" ? 24 : durationHours) * 3_600_000 : startMs;
      const availableEndMs = id === "timeline" ? Math.min(endMs, Date.parse(MAIN_SERIES_END)) : endMs;
      if (startMs < Date.parse(MAIN_SERIES_START) || availableEndMs > Date.parse(MAIN_SERIES_END) || (id !== "timeline" && endMs > Date.parse(MAIN_SERIES_END))) return errorJson(`Stored JPL Horizons ephemeris covers ${MAIN_SERIES_START} through ${MAIN_SERIES_END}`, 422);
      const stepMinutes = Number(url.searchParams.get("stepMinutes") ?? 1);
      if (id === "timeline" && (!Number.isInteger(stepMinutes) || stepMinutes < 1 || stepMinutes > 60)) return errorJson("stepMinutes must be an integer from 1 to 60");
      const fromIso = new Date(startMs).toISOString();
      const toIso = new Date(availableEndMs).toISOString();
      const chunkIds = monthChunkIds(fromIso, toIso).filter((chunkId) => chunkId <= "2030-12");
      const siteSnap = siteId ? await db.doc(`sites/${siteId}`).get() : null;
      if (siteId && !siteSnap?.exists) return errorJson("Site not found", 404);
      const position = siteSnap?.data()?.coordinates as { latDeg?: number; lonDeg?: number } | undefined;
      // Catalog sites get "scientific" results only with a verified point coordinate (see lib/science/site-eligibility.ts).
      const eligibility = siteId ? scienceEligibility(siteSnap?.data()) : null;
      if (eligibility && !eligibility.ok) return errorJson(eligibility.reason, 422);
      const latitude = eligibility?.ok ? eligibility.latDeg : lat;
      const longitude = eligibility?.ok ? eligibility.lonDeg : lon;
      const chunkSnaps = await Promise.all(chunkIds.map((chunkId) => db.doc(`ephemerisGlobal/${chunkId}`).get()));
      if (chunkSnaps.some((snap) => !snap.exists)) return errorJson("Ephemeris data unavailable for this interval", 503);
      const series = new CartesianSeries(chunkSnaps.map((snap, index) => ephemerisChunk(chunkIds[index], snap.data()!)));
      let mask = smoothHorizonMask();
      let horizonSource = "none — smooth horizon";
      let slopeDeg: number | null = null;
      let elevationMeters: number | null = null;
      // Whether the LOLA terrain-grid cell lies inside a permanently shadowed region (PSR); south polar points only.
      // The cells' nearestPsrKm is not exposed: the seeded values are all zero, so it carries no information yet.
      let insidePsr: boolean | null = null;
      const loadGridTile = async (snap: NonNullable<ReturnType<typeof snapToGrid>>) => {
        const tileSnap = await db.doc(`terrainGrid/${snap.tileId}`).get();
        if (!tileSnap.exists) return null;
        const d = tileSnap.data()!;
        const cells = Number(d.cellsPerSide) ** 2;
        const bins = Number(d.bins);
        return {
          id: snap.tileId, gridSpacingKm: Number(d.gridSpacingKm), tileOriginXY: d.tileOriginXY,
          cellsPerSide: Number(d.cellsPerSide), binDeg: Number(d.binDeg), bins,
          masks: decodeInt16(binary(d.masks)), maskErr: decodeUint8(binary(d.maskErr)),
          cellStats: decodeCellStats(binary(d.cellStats), decodeInt16(binary(d.masks)), bins, cells),
          demProducts: d.demProducts ?? [], rayLengthKm: Number(d.rayLengthKm), observerHeightM: Number(d.observerHeightM), computedAt: d.computedAt,
        };
      };
      const terrainSnap = siteId ? await db.doc(`sites/${siteId}/terrain/v1`).get() : null;
      if (terrainSnap?.exists) {
        mask = horizonFromDoc(terrainSnap.data()!);
        horizonSource = "LOLA DEM";
        slopeDeg = terrainSnap.get("slope100mDeg") ?? null;
        elevationMeters = position?.latDeg == null ? null : siteSnap?.get("coordinates.elevationM") ?? null;
      }
      if (latitude <= -80 && (!terrainSnap?.exists || id === "metrics")) {
        const snap = snapToGrid(latitude, longitude);
        const tile = snap ? await loadGridTile(snap) : null;
        const cell = snap && tile ? tile.cellStats[snap.cellIndex] : undefined;
        if (snap && tile && !terrainSnap?.exists) {
          const gridMask = maskFromGridCell(tile, snap.cellIndex);
          if (gridMask) { mask = gridMask; horizonSource = `LOLA DEM grid · ${snap.gridSpacingKm} km cell, ${snap.distanceKm.toFixed(1)} km from point`; slopeDeg = cell?.slope100mDeg ?? null; }
        }
        if (cell?.hasData) insidePsr = cell.insidePsr;
      }
      const frame = siteFrame(latitude, longitude);
      // Shared with the client graphs: lib/science/sky.ts holds the one visibility implementation.
      const profile: HorizonProfile = { elevationsDeg: mask.source === "none" ? null : mask.maskElevationDeg, azimuthStepDeg: mask.binDeg };
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
      const points = skySamples(series, frame, profile, startMs, endMs - 1, 10);
      const sunlit = points.map((p) => p.sunVisible), earthVisible = points.map((p) => p.earthVisible);
      const share = (flags: boolean[]) => flags.filter(Boolean).length / flags.length;
      const smooth = mask.source === "none";
      return json({
        sunlightPercent: Math.round(share(sunlit) * 100), sunlightHours: Number((share(sunlit) * durationHours).toFixed(1)),
        longestDarknessHours: longestRunHours(sunlit, false, 1 / 6), earthVisibilityPercent: Math.round(share(earthVisible) * 100),
        longestBlackoutHours: longestRunHours(earthVisible, false, 1 / 6), ...(slopeDeg !== null ? { slopeDeg } : {}), ...(elevationMeters !== null ? { elevationMeters } : {}),
        ...(insidePsr !== null ? { insidePsr } : {}),
        intervalStart: fromIso, intervalEnd: toIso, horizonSource,
        assumptions: ["10-minute sampling; run lengths limited to the interval", "Sun and Earth treated as points (centre of disk), no refraction", smooth ? "No terrain mask for this location: smooth-sphere horizon, so lit and visible shares are upper bounds" : "Terrain occlusion from the precomputed horizon mask"],
        provenance: "scientific",
      });
    }

    if (root === "users" && id) {
      const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
      if (!decoded) return errorJson("Valid Firebase ID token required", 401);
      if (decoded.uid !== id) return errorJson("Forbidden", 403);
      if (!child) {
        const snap = await db.doc(`users/${id}`).get();
        return snap.exists ? json(docValue(snap), { headers: { "Cache-Control": "no-store" } }) : errorJson("User not found", 404);
      }
      if (!child || !SUBCOLLECTIONS.has(child)) return errorJson("Unknown user resource", 404);
      if (child === "progress") {
        const snap = await db.doc(`users/${id}/progress/state`).get();
        return json({ progress: docValue(snap) }, { headers: { "Cache-Control": "no-store" } });
      }
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
      const orderField = child === "sessions" ? "updatedAt" : "createdAt";
      const snap = await db.collection(`users/${id}/${child}`).orderBy(orderField, "desc").limit(limit).get();
      return json({ items: snap.docs.map(docValue), count: snap.size }, { headers: { "Cache-Control": "no-store" } });
    }

    const collectionName = PUBLIC_COLLECTIONS[root ?? ""];
    if (!collectionName) return errorJson("Resource not found", 404);
    if (id) {
      if (!validId(id)) return errorJson("Invalid document id", 400);
      const suffix = collectionName === "sites" && child === "terrain" && childId ? `/terrain/${childId}` : "";
      const snap = await db.doc(`${collectionName}/${id}${suffix}`).get();
      return snap.exists ? json(docValue(snap)) : errorJson("Document not found", 404);
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? MAX_LIMIT) || MAX_LIMIT));
    const cursor = url.searchParams.get("cursor");
    if (cursor && !validId(cursor)) return errorJson("Invalid cursor", 400);
    let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    return json({ items: snap.docs.map(docValue), count: snap.size, limit, hasMore: snap.size === limit, nextCursor: snap.docs.at(-1)?.id ?? null });
  } catch (error) {
    console.error("GET /api/v1 failed:", error instanceof Error ? error.message : error);
    return errorJson("Data service unavailable", 503);
  }
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const [root, uid, resource, itemId] = path;
  if (root !== "users" || !uid || !resource) return errorJson("Writes are only available for authenticated owner data", 404);
  if (!hasAdminCredentials()) return adminCredentialsRequired();
  const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
  if (!decoded) return errorJson("Valid Firebase ID token required", 401);
  if (decoded.uid !== uid) return errorJson("Forbidden", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return errorJson("Request body must be JSON"); }
  const db = adminDb();
  const profileId = body.profileId;
  const profileIds = ["short-landing", "robotic-14-day", "long-term-base"];
  if (resource === "sessions") {
    const selections = body.siteSelections;
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > 3 || !selections.every(validateSelection)) return errorJson("siteSelections must contain one to three valid site selections");
    if (!profileIds.includes(String(profileId)) || typeof body.name !== "string" || body.name.length > 120) return errorJson("A valid profileId and name (up to 120 characters) are required");
    const window = body.window as Record<string, unknown> | undefined;
    if (!window || typeof window.start !== "string" || Number.isNaN(Date.parse(window.start)) || typeof window.end !== "string" || Number.isNaN(Date.parse(window.end)) || Date.parse(window.end) < Date.parse(window.start) || !Number.isInteger(window.stepMinutes) || Number(window.stepMinutes) < 1 || typeof body.scrubTime !== "string" || Number.isNaN(Date.parse(body.scrubTime))) return errorJson("A valid UTC window, stepMinutes, and scrubTime are required");
    const ref = itemId && validId(itemId) ? db.doc(`users/${uid}/sessions/${itemId}`) : db.collection(`users/${uid}/sessions`).doc();
    const now = FieldValue.serverTimestamp();
    await ref.set({ name: body.name, siteSelections: selections, window: body.window, scrubTime: body.scrubTime, profileId, createdAt: itemId ? (await ref.get()).get("createdAt") ?? now : now, updatedAt: now }, { merge: true });
    return json({ id: ref.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "reports") {
    if (!Array.isArray(body.siteSummaries) || body.siteSummaries.length < 1 || body.siteSummaries.length > 3 || !profileIds.includes(String(profileId)) || !["pdf", "csv"].includes(String(body.format))) return errorJson("Report requires 1–3 summaries, a valid profileId and format");
    const reportWindow = body.window as Record<string, unknown> | undefined;
    if (!reportWindow || typeof reportWindow.start !== "string" || Number.isNaN(Date.parse(reportWindow.start)) || typeof reportWindow.end !== "string" || Number.isNaN(Date.parse(reportWindow.end)) || Date.parse(reportWindow.end) < Date.parse(reportWindow.start) || !Number.isInteger(reportWindow.stepMinutes) || Number(reportWindow.stepMinutes) < 1 || typeof body.methodsSummary !== "string" || body.methodsSummary.length > 4000 || typeof body.disclaimer !== "string" || body.disclaimer.length > 1000) return errorJson("Report requires a valid UTC window, methodsSummary, and disclaimer");
    if (body.siteSummaries.some((summary) => {
      if (!summary || typeof summary !== "object") return true;
      const value = summary as Record<string, unknown>;
      return typeof value.siteLabel !== "string" || value.siteLabel.length > 160 || !Number.isFinite(value.latDeg) || !Number.isFinite(value.lonDeg) || !Array.isArray(value.flags) || value.flags.length > 50;
    })) return errorJson("Each report summary needs a siteLabel, coordinates, and a short flags list");
    const ref = db.collection(`users/${uid}/reports`).doc();
    await ref.set({
      profileId,
      window: { start: reportWindow.start, end: reportWindow.end, stepMinutes: reportWindow.stepMinutes },
      siteSummaries: (body.siteSummaries as Record<string, unknown>[]).map((summary) => ({
        siteLabel: summary.siteLabel, latDeg: summary.latDeg, lonDeg: summary.lonDeg,
        scoreTotal: typeof summary.scoreTotal === "number" ? summary.scoreTotal : null,
        disqualified: summary.disqualified === true,
        longestLitHours: Number(summary.longestLitHours) || 0,
        longestDarkHours: Number(summary.longestDarkHours) || 0,
        minSocPct: typeof summary.minSocPct === "number" ? summary.minSocPct : null,
        flags: (summary.flags as unknown[]).filter((flag): flag is string => typeof flag === "string").slice(0, 50),
      })),
      methodsSummary: body.methodsSummary, disclaimer: body.disclaimer, format: body.format,
      createdAt: FieldValue.serverTimestamp(),
    });
    return json({ id: ref.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  if (resource === "progress") {
    const chapters = ["ch1-first-landing", "ch2-robotic-explorer", "ch3-lunar-base"];
    const tools = ["horizon-dial", "power-simulator", "base-scoring"];
    if (!Array.isArray(body.chaptersCompleted) || body.chaptersCompleted.some((v) => !chapters.includes(String(v))) || !Array.isArray(body.unlockedTools) || body.unlockedTools.some((v) => !tools.includes(String(v))) || typeof body.expertMode !== "boolean" || typeof body.stepAnswers !== "object" || body.stepAnswers === null) return errorJson("Invalid progress state");
    const expectedChapters = chapters.slice(0, body.chaptersCompleted.length);
    const expectedTools = body.expertMode ? tools : tools.slice(0, expectedChapters.length);
    if (JSON.stringify(body.chaptersCompleted) !== JSON.stringify(expectedChapters) || JSON.stringify(body.unlockedTools) !== JSON.stringify(expectedTools) || Object.keys(body.stepAnswers as Record<string, unknown>).length > 100) return errorJson("Progress must follow the guided chapter and tool unlock order");
    await db.doc(`users/${uid}/progress/state`).set({ version: 1, chaptersCompleted: body.chaptersCompleted, unlockedTools: body.unlockedTools, expertMode: body.expertMode, stepAnswers: body.stepAnswers, updatedAt: FieldValue.serverTimestamp() });
    return json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  }
  return errorJson("Unknown user resource", 404);
}

export async function DELETE(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const [root, uid, resource, itemId] = path;
  if (root !== "users" || !uid || !resource || !itemId || !["sessions", "reports"].includes(resource) || !validId(itemId)) return errorJson("Unknown resource", 404);
  if (!hasAdminCredentials()) return adminCredentialsRequired();
  const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
  if (!decoded) return errorJson("Valid Firebase ID token required", 401);
  if (decoded.uid !== uid) return errorJson("Forbidden", 403);
  const ref = adminDb().doc(`users/${uid}/${resource}/${itemId}`);
  const snap = await ref.get();
  if (!snap.exists) return errorJson("Document not found", 404);
  await ref.delete();
  return json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
