/**
 * End-to-end smoke test of the client data layer against the local emulators.
 *
 *   npm run emulators            # terminal 1
 *   npm run seed:emulator        # optional: enables the data checks
 *   npm run smoke                # terminal 2
 *
 * Uses the client SDK in Node with NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true, the real
 * project id and a demo API key. Never touches production.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EphemerisChunk, SavedReportSummary, SessionState } from "../lib/model/types";

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const rcProject = (() => {
  try {
    return (JSON.parse(readFileSync(path.join(ROOT, ".firebaserc"), "utf8")) as { projects?: { default?: string } }).projects?.default;
  } catch {
    return undefined;
  }
})();
process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR = "true";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "demo-smoke-api-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= rcProject ?? "shadowline-2t12";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;

let passed = 0;
let failed = 0;
let skipped = 0;
function pass(msg: string): void {
  passed++;
  console.log(`  PASS  ${msg}`);
}
function failCheck(msg: string): void {
  failed++;
  console.log(`  FAIL  ${msg}`);
}
function skip(msg: string): void {
  skipped++;
  console.log(`  SKIP  ${msg}`);
}
function check(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else failCheck(msg);
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function importOptional(rel: string): Promise<Record<string, unknown> | null> {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) return null;
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

async function userFlow(): Promise<void> {
  const { getFirebaseAuth, getDb } = await import("../lib/firebase/client");
  const { createUserWithEmailAndPassword, signOut } = await import("firebase/auth");
  const { doc, getDoc, setDoc } = await import("firebase/firestore");
  const { ensureUserDoc } = await import("../lib/auth/ensureUserDoc");
  const progress = await import("../lib/firestore/progressService");
  const { ChapterOrderError } = await import("../lib/firestore/errors");
  const sessions = await import("../lib/firestore/sessionService");
  const reports = await import("../lib/firestore/reportService");
  const { userDocConverter } = await import("../lib/firestore/converters");

  console.log("\nUser data");
  const auth = getFirebaseAuth();
  const email = `smoke-${Date.now()}@example.test`;
  const { user } = await createUserWithEmailAndPassword(auth, email, "smoke-password-1");
  pass(`signed in emulator user ${user.uid}`);

  check((await ensureUserDoc(user)) === true, "ensureUserDoc creates users/{uid} on first sign-in");
  check((await ensureUserDoc(user)) === false, "ensureUserDoc only bumps lastSeenAt on later sign-ins");
  const userSnap = await getDoc(doc(getDb(), "users", user.uid).withConverter(userDocConverter));
  check(userSnap.exists() && userSnap.data()?.expertMode === false && userSnap.data()?.email === email, "users/{uid} has expected fields");

  try {
    await progress.completeChapter(user.uid, "ch2-robotic-explorer");
    failCheck("out-of-order completeChapter(ch2) should throw");
  } catch (e) {
    check(e instanceof ChapterOrderError, `out-of-order completeChapter(ch2) rejected (${(e as Error).message})`);
  }
  let p = await progress.completeChapter(user.uid, "ch1-first-landing");
  check(!progress.isMissionControlUnlocked(p) && p.unlockedTools.join() === "horizon-dial", "ch1 complete, horizon-dial unlocked, Mission Control locked");
  p = await progress.completeChapter(user.uid, "ch2-robotic-explorer");
  check(!progress.isMissionControlUnlocked(p), "ch2 complete, Mission Control still locked");
  await progress.completeChapter(user.uid, "ch3-lunar-base");
  p = await progress.getProgress(user.uid);
  check(
    progress.isMissionControlUnlocked(p) && p.chaptersCompleted.length === 3 && p.unlockedTools.length === 3,
    "after ch3 (re-read from Firestore): all chapters + tools, isMissionControlUnlocked = true",
  );
  p = await progress.saveStepAnswer(user.uid, "ch1-step-1", 10.5);
  check((await progress.getProgress(user.uid)).stepAnswers["ch1-step-1"] === 10.5, "saveStepAnswer persisted");
  await progress.enableExpertMode(user.uid);
  const after = await getDoc(doc(getDb(), "users", user.uid).withConverter(userDocConverter));
  check(after.data()?.expertMode === true, "enableExpertMode mirrors expertMode on users/{uid}");

  const state: SessionState = {
    siteSelections: [
      { kind: "library", siteId: "apollo-11-tranquility" },
      { kind: "custom", label: "Shackleton rim, test", coordinates: { latDeg: -89.45, lonDeg: -137.31 } },
    ],
    window: { start: "2027-01-01T00:00:00Z", end: "2027-01-15T00:00:00Z", stepMinutes: 60 },
    scrubTime: "2027-01-02T12:00:00Z",
    profileId: "robotic-14-day",
  };
  const decoded = sessions.decodeSessionFromUrl(sessions.encodeSessionToUrl(state));
  check(JSON.stringify(decoded) === JSON.stringify(state), "session URL encode/decode round-trips");
  const sid = await sessions.saveSession(user.uid, "Smoke session", state);
  const list = await sessions.listSessions(user.uid);
  check(list.length === 1 && list[0].id === sid && list[0].siteSelections.length === 2, "saveSession + listSessions");

  const summary: SavedReportSummary = {
    siteLabel: "Apollo 11",
    latDeg: 0.67416,
    lonDeg: 23.47314,
    scoreTotal: null,
    disqualified: false,
    longestLitHours: 100,
    longestDarkHours: 0,
    minSocPct: null,
    flags: [],
  };
  const withSeries = {
    profileId: "short-landing" as const,
    window: state.window,
    siteSummaries: [{ ...summary, series: [1, 2, 3] }],
    methodsSummary: "smoke",
    disclaimer: "smoke",
    format: "pdf" as const,
    series: [{ time: "x", sunElevationDeg: 1 }],
  };
  const rid = await reports.saveReportSummary(user.uid, withSeries);
  const raw = (await getDoc(doc(getDb(), "users", user.uid, "reports", rid))).data() ?? {};
  const rawSummary = (raw.siteSummaries as Record<string, unknown>[] | undefined)?.[0] ?? {};
  check(!("series" in raw) && !("series" in rawSummary), "stored report has no series (top level or per site)");
  check((await reports.listReports(user.uid)).length === 1, "listReports");

  try {
    await setDoc(doc(getDb(), "sites", "smoke-test"), { name: "x" });
    failCheck("client write to sites/* should be denied");
  } catch (e) {
    check((e as { code?: string }).code === "permission-denied", "client write to sites/* denied by rules");
  }
  await signOut(auth);
}

async function dataFlow(): Promise<void> {
  const { getSite } = await import("../lib/firestore/sitesService");
  const { getSiteTerrain } = await import("../lib/firestore/terrainService");
  const { getEphemerisChunk } = await import("../lib/firestore/ephemerisService");
  const { getTerrainGridTile } = await import("../lib/firestore/terrainGridService");
  const { DocumentNotFoundError } = await import("../lib/firestore/errors");

  console.log("\nSeeded data");
  const siteId = "apollo-11-tranquility";
  const site = await getSite(siteId);
  if (!site?.coordinates) {
    skip(`sites/${siteId} not in the emulator (run npm run seed:emulator); skipping data checks`);
    return;
  }
  pass(`loaded sites/${siteId}`);

  const terrain = await getSiteTerrain(siteId);
  if (terrain) pass(`loaded sites/${siteId}/terrain/v1 (${terrain.mask.maskElevationDeg.length} bins)`);
  else skip(`sites/${siteId}/terrain/v1 not seeded yet`);

  let chunk: EphemerisChunk | null = null;
  try {
    chunk = await getEphemerisChunk(`hist-${siteId}`);
    pass(`loaded ephemerisGlobal/hist-${siteId} (${chunk.count} rows)`);
  } catch (e) {
    if (e instanceof DocumentNotFoundError) skip(`ephemerisGlobal/hist-${siteId} not seeded yet`);
    else throw e;
  }

  const eph = await importOptional("lib/ephemeris/index.ts");
  const compute = eph?.computeTopocentricFromChunks;
  if (!chunk) {
    // already reported
  } else if (typeof compute !== "function") {
    skip("lib/ephemeris does not export computeTopocentricFromChunks yet");
  } else {
    const t = "1969-07-20T20:17:40Z";
    const hKm = (site.coordinates.elevationM ?? 0) / 1000;
    const r = compute([chunk], site.coordinates.latDeg, site.coordinates.lonDeg, t, hKm) as {
      sun: { elevationDeg: number; azimuthDeg: number };
    };
    const el = r.sun.elevationDeg;
    check(Math.abs(el - 10.7) <= 0.02, `Apollo 11 sun elevation at ${t} = ${el.toFixed(3)}° (expect 10.70 ± 0.02; az ${r.sun.azimuthDeg.toFixed(2)}°)`);
  }

  const terrainMod = await importOptional("lib/terrain/index.ts");
  const snap = terrainMod?.snapToGrid;
  if (typeof snap !== "function") {
    skip("lib/terrain does not export snapToGrid yet");
    return;
  }
  const s = snap(-89.45, -137.31) as { tileId: string; cellIndex: number; distanceKm: number } | null;
  if (!s) {
    failCheck("snapToGrid(-89.45, -137.31) returned null inside the polar grid");
    return;
  }
  pass(`snapToGrid(-89.45, -137.31) -> ${s.tileId} cell ${s.cellIndex} (${s.distanceKm.toFixed(3)} km)`);
  const tile = await getTerrainGridTile(s.tileId);
  if (!tile) {
    skip(`terrainGrid/${s.tileId} not seeded yet`);
    return;
  }
  const cell = tile.cellStats[s.cellIndex];
  check(cell !== undefined, `terrainGrid/${s.tileId} cell ${s.cellIndex}: ${JSON.stringify(cell)}`);
}

async function main(): Promise<void> {
  console.log(`Shadowline emulator smoke test (project ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})`);
  const fsPort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT) || 8080;
  const authPort = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT) || 9099;
  const [fs, au] = await Promise.all([reachable(`http://127.0.0.1:${fsPort}/`), reachable(`http://127.0.0.1:${authPort}/`)]);
  if (!fs || !au) {
    console.error(`Emulators not reachable (firestore ${fsPort}: ${fs}, auth ${authPort}: ${au}). Start them with: npm run emulators`);
    process.exit(1);
  }
  await userFlow();
  await dataFlow();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
