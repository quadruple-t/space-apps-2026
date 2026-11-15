import { GLOBE_ARCHIVE_DOC } from "@/lib/globe-archive";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminCredentialsRequired, adminDb, hasAdminCredentials, verifyFirebaseToken } from "@/lib/firebase/admin";
import { publicReadDb } from "@/lib/firebase/public-read-db";
import { errorJson, json, serialize } from "@/lib/api/http";
import { scienceGet, validId } from "@/lib/api/science";

const PUBLIC_COLLECTIONS: Record<string, string> = {
  sites: "sites", chapters: "storyChapters", profiles: "missionProfiles", zones: "protectionZones",
  presets: "landerPresets", facts: "facts", validations: "validationChecks", sources: "dataSources",
  ephemeris: "ephemerisGlobal", terrain: "terrainGrid", psr: "psrLayer", composition: "compositionGrid", demos: "demo",
};
const SUBCOLLECTIONS = new Set(["sessions", "reports", "progress"]);
const MAX_LIMIT = 250;

function docValue(snap: FirebaseFirestore.DocumentSnapshot) {
  return snap.exists ? { id: snap.id, ...(serialize(snap.data()) as Record<string, unknown>) } : null;
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

    if (path.length === 0 || root === "manifest") return json({ version: "v1", basePath: "/api/v1", resources: ["catalog/sites", "catalog/meta", "science/celestial", "science/horizon", "science/metrics", "science/compare", "science/timeline", "science/rank", "science/composition", ...Object.keys(PUBLIC_COLLECTIONS), "users/{uid}/sessions", "users/{uid}/reports", "users/{uid}/progress"] });
    if (root === "users" && !hasAdminCredentials()) return adminCredentialsRequired();
    // Public endpoints use the Web SDK and public Firestore rules. This avoids making
    // catalog/science reads depend on a local service-account key or ADC configuration.
    const db = root === "users" ? adminDb() : publicReadDb();
    if (root === "globe" && id === "manifest" && !child) {
      const snap = await db.doc(GLOBE_ARCHIVE_DOC).get();
      return snap.exists ? json(serialize(snap.data())) : errorJson("Globe snapshots have not been imported", 404);
    }
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

    if (root === "science") return await scienceGet(db, id, url);

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
