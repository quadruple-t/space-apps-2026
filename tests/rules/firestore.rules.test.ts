/**
 * Security-rules tests for firestore.rules. Run with `npm run test:rules`, which starts the
 * Firestore emulator via `firebase emulators:exec --only firestore`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "shadowline-2t12";
const A = "alice";
const B = "bob";

const STATIC_PATHS = [
  "sites/apollo-11-tranquility",
  "sites/apollo-11-tranquility/terrain/v1",
  "storyChapters/ch1-first-landing",
  "missionProfiles/short-landing",
  "protectionZones/zone-1",
  "dataSources/source-1",
  "validationChecks/check-1",
  "landerPresets/preset-1",
  "facts/lunar-constants",
  "ephemerisGlobal/2027-01",
  "terrainGrid/tile-1",
  "psrLayer/south-1km2",
  "compositionGrid/lp-grs-2deg",
  "demo/home",
  "catalog/siteIndex",
] as const;

const validUser = () => ({
  displayName: "Alice",
  email: "alice@example.test",
  photoURL: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expertMode: false,
});

const validProgress = () => ({
  version: 1,
  chaptersCompleted: ["ch1-first-landing"],
  unlockedTools: ["horizon-dial"],
  expertMode: false,
  stepAnswers: { "ch1-step-1": 10 },
  updatedAt: new Date(),
});

const win = { start: "2027-01-01T00:00:00Z", end: "2027-01-15T00:00:00Z", stepMinutes: 60 };
const selection = { kind: "library", siteId: "apollo-11-tranquility" };
const validSession = () => ({
  name: "Session",
  siteSelections: [selection],
  window: win,
  scrubTime: "2027-01-02T00:00:00Z",
  profileId: "short-landing",
  createdAt: new Date(),
  updatedAt: new Date(),
});

const summary = {
  siteLabel: "Apollo 11",
  latDeg: 0.67,
  lonDeg: 23.47,
  scoreTotal: null,
  disqualified: false,
  longestLitHours: 1,
  longestDarkHours: 0,
  minSocPct: null,
  flags: [],
};
const validReport = () => ({
  profileId: "short-landing",
  window: win,
  siteSummaries: [summary],
  methodsSummary: "m",
  disclaimer: "d",
  format: "pdf",
  createdAt: new Date(),
});

let env: RulesTestEnvironment;
const anon = (): RulesTestContext => env.unauthenticatedContext();
const as = (uid: string): RulesTestContext => env.authenticatedContext(uid);
const ref = (ctx: RulesTestContext, p: string) => ctx.firestore().doc(p);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const p of STATIC_PATHS) await db.doc(p).set({ seeded: true });
    await db.doc(`users/${A}`).set(validUser());
    await db.doc(`users/${B}`).set({ ...validUser(), displayName: "Bob" });
    await db.doc(`users/${A}/reports/r1`).set(validReport());
  });
});

describe("static collections", () => {
  for (const p of STATIC_PATHS) {
    it(`signed-out can read ${p}`, async () => {
      await assertSucceeds(ref(anon(), p).get());
    });
    it(`nobody can write ${p}`, async () => {
      await assertFails(ref(anon(), p).set({ x: 1 }));
      await assertFails(ref(as(A), p).set({ x: 1 }));
      await assertFails(ref(as(A), p).update({ x: 1 }));
      await assertFails(ref(as(A), p).delete());
      await assertFails(ref(as(A), `${p.split("/")[0]}/new-doc`).set({ x: 1 }));
    });
  }
});

describe("users/{uid}", () => {
  it("owner can read and write their user doc", async () => {
    await assertSucceeds(ref(as(A), `users/${A}`).get());
    await assertSucceeds(ref(as(A), `users/${A}`).update({ lastSeenAt: new Date() }));
    await assertSucceeds(ref(as("carol"), "users/carol").set(validUser()));
  });
  it("cannot read or write another user's doc", async () => {
    await assertFails(ref(as(A), `users/${B}`).get());
    await assertFails(ref(as(A), `users/${B}`).update({ lastSeenAt: new Date() }));
    await assertFails(ref(anon(), `users/${A}`).get());
  });
  it("rejects unknown keys, non-bool expertMode and delete", async () => {
    await assertFails(ref(as(A), `users/${A}`).update({ isAdmin: true }));
    await assertFails(ref(as(A), `users/${A}`).update({ expertMode: "yes" }));
    await assertFails(ref(as(A), `users/${A}`).delete());
  });
});

describe("users/{uid}/progress", () => {
  const progressPath = `users/${A}/progress/state`;
  it("accepts a valid progress/state", async () => {
    await assertSucceeds(ref(as(A), progressPath).set(validProgress()));
    await assertSucceeds(ref(as(A), progressPath).get());
  });
  it("accepts all three chapters and tools", async () => {
    await assertSucceeds(
      ref(as(A), progressPath).set({
        ...validProgress(),
        chaptersCompleted: ["ch1-first-landing", "ch2-robotic-explorer", "ch3-lunar-base"],
        unlockedTools: ["horizon-dial", "power-simulator", "base-scoring"],
      }),
    );
  });
  it("other users cannot read or write it", async () => {
    await assertFails(ref(as(B), progressPath).set(validProgress()));
    await assertFails(ref(as(B), progressPath).get());
  });
  it("rejects an unknown chapter id", async () => {
    await assertFails(ref(as(A), progressPath).set({ ...validProgress(), chaptersCompleted: ["ch9-unknown"] }));
  });
  it("rejects 4 chapters", async () => {
    await assertFails(
      ref(as(A), progressPath).set({
        ...validProgress(),
        chaptersCompleted: ["ch1-first-landing", "ch2-robotic-explorer", "ch3-lunar-base", "ch1-first-landing"],
      }),
    );
  });
  it("rejects a bad tool id", async () => {
    await assertFails(ref(as(A), progressPath).set({ ...validProgress(), unlockedTools: ["laser-drill"] }));
  });
  it("rejects version != 1", async () => {
    await assertFails(ref(as(A), progressPath).set({ ...validProgress(), version: 2 }));
  });
  it("rejects a doc id other than state", async () => {
    await assertFails(ref(as(A), `users/${A}/progress/other`).set(validProgress()));
  });
  it("rejects extra keys", async () => {
    await assertFails(ref(as(A), progressPath).set({ ...validProgress(), score: 100 }));
  });
  it("cannot be deleted", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(progressPath).set(validProgress());
    });
    await assertFails(ref(as(A), progressPath).delete());
  });
});

describe("users/{uid}/sessions", () => {
  const s = `users/${A}/sessions/s1`;
  it("owner can create, read, update and delete", async () => {
    await assertSucceeds(ref(as(A), s).set(validSession()));
    await assertSucceeds(ref(as(A), s).get());
    await assertSucceeds(ref(as(A), s).set({ ...validSession(), name: "Renamed" }));
    await assertSucceeds(ref(as(A), s).delete());
  });
  it("other users are denied", async () => {
    await assertFails(ref(as(B), s).set(validSession()));
  });
  it("rejects 0 selections", async () => {
    await assertFails(ref(as(A), s).set({ ...validSession(), siteSelections: [] }));
  });
  it("rejects 4 selections", async () => {
    await assertFails(ref(as(A), s).set({ ...validSession(), siteSelections: [selection, selection, selection, selection] }));
  });
  it("rejects a bad profileId", async () => {
    await assertFails(ref(as(A), s).set({ ...validSession(), profileId: "week-long" }));
  });
});

describe("users/{uid}/reports", () => {
  const r = `users/${A}/reports/new`;
  it("owner can create, read and delete", async () => {
    await assertSucceeds(ref(as(A), r).set(validReport()));
    await assertSucceeds(ref(as(A), r).get());
    await assertSucceeds(ref(as(A), r).delete());
  });
  it("other users are denied", async () => {
    await assertFails(ref(as(B), `users/${A}/reports/r1`).get());
    await assertFails(ref(as(B), r).set(validReport()));
  });
  it("rejects 0 summaries", async () => {
    await assertFails(ref(as(A), r).set({ ...validReport(), siteSummaries: [] }));
  });
  it("rejects 4 summaries", async () => {
    await assertFails(ref(as(A), r).set({ ...validReport(), siteSummaries: [summary, summary, summary, summary] }));
  });
  it("rejects a series field", async () => {
    await assertFails(ref(as(A), r).set({ ...validReport(), series: [1, 2, 3] }));
  });
  it("denies update", async () => {
    await assertFails(ref(as(A), `users/${A}/reports/r1`).update({ methodsSummary: "edited" }));
    await assertFails(ref(as(A), `users/${A}/reports/r1`).set({ ...validReport(), methodsSummary: "edited" }));
  });
});

describe("default deny", () => {
  for (const p of ["randomCollection/x", "sites/apollo-11-tranquility/other/x", `users/${A}/other/x`, "catalog/siteIndex/extra/x"]) {
    it(`denies ${p}`, async () => {
      await assertFails(ref(anon(), p).get());
      await assertFails(ref(as(A), p).get());
      await assertFails(ref(as(A), p).set({ x: 1 }));
    });
  }
});
