/**
 * Security-rules tests for users/{uid}/expeditions (+ studies, chat). Run with `npm run test:rules`.
 * Sign-in stays optional: these rules only guard the per-user saved work, never public reads.
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
import { EXPEDITION_LIMITS } from "@/lib/expeditions/types";

const A = "alice";
const B = "bob";
const EXP = `users/${A}/expeditions/e1`;

const site = {
  id: "saved-1", name: "Rim", latitudeDeg: -89.4, longitudeDeg: 222.7, radiusKm: 5,
  coordinateReference: "MOON_ME", provenance: "user", kind: "saved",
};
const validExpedition = () => ({
  version: 1,
  name: "South pole survey",
  notes: "",
  workspace: { view: "globe", site: null, startIso: "2026-12-01T00:00:00.000Z", durationHours: 709, elapsedHours: 0, speed: 10, layers: {}, meteorStream: "Geminids", showCatalog: false, graphTab: "daily", panelAreaM2: 1, panelEfficiency: 0.3 },
  sites: [site],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastOpenedAt: new Date(),
});
const validStudy = () => ({
  kind: "comparison",
  source: "compare-page",
  label: "Shackleton vs Haworth",
  inputs: { siteIds: ["a", "b"], start: "2026-12-01T00:00:00.000Z", durationHours: 24 },
  result: { sites: [{ siteId: "a", horizonSource: "Smooth-sphere fallback" }] },
  createdAt: new Date(),
});
const validChat = () => ({ version: 1, messages: [{ role: "user", text: "Hi", answered: true }], updatedAt: new Date() });

let env: RulesTestEnvironment;
const anon = (): RulesTestContext => env.unauthenticatedContext();
const as = (uid: string): RulesTestContext => env.authenticatedContext(uid);
const ref = (ctx: RulesTestContext, p: string) => ctx.firestore().doc(p);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "shadowline-2t12",
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
    await db.doc(EXP).set(validExpedition());
    await db.doc(`${EXP}/studies/s1`).set(validStudy());
    await db.doc(`${EXP}/chat/transcript`).set(validChat());
    await db.doc("catalog/siteIndex").set({ seeded: true });
  });
});

describe("users/{uid}/expeditions", () => {
  it("owner can create, read, update and delete", async () => {
    const p = `users/${A}/expeditions/new`;
    await assertSucceeds(ref(as(A), p).set(validExpedition()));
    await assertSucceeds(ref(as(A), p).get());
    await assertSucceeds(ref(as(A), p).set({ workspace: { view: "orbit" }, updatedAt: new Date(), version: 1 }, { merge: true }));
    await assertSucceeds(ref(as(A), p).update({ name: "Renamed", notes: "Ice first" }));
    await assertSucceeds(ref(as(A), p).delete());
  });
  it("other users and signed-out visitors are denied", async () => {
    await assertFails(ref(as(B), EXP).get());
    await assertFails(ref(as(B), EXP).set(validExpedition()));
    await assertFails(ref(as(B), EXP).delete());
    await assertFails(ref(anon(), EXP).get());
    await assertFails(ref(anon(), `users/${A}/expeditions/x`).set(validExpedition()));
  });
  it("rejects bad shapes", async () => {
    const p = `users/${A}/expeditions/bad`;
    await assertFails(ref(as(A), p).set({ ...validExpedition(), name: "" }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), name: "x".repeat(EXPEDITION_LIMITS.nameChars + 1) }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), notes: "x".repeat(EXPEDITION_LIMITS.notesChars + 1) }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), sites: Array.from({ length: EXPEDITION_LIMITS.sites + 1 }, () => site) }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), workspace: "globe" }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), version: 2 }));
    await assertFails(ref(as(A), p).set({ ...validExpedition(), ownerUid: B }));
  });
  it("accepts exactly the size caps", async () => {
    await assertSucceeds(ref(as(A), `users/${A}/expeditions/max`).set({
      ...validExpedition(),
      name: "x".repeat(EXPEDITION_LIMITS.nameChars),
      notes: "x".repeat(EXPEDITION_LIMITS.notesChars),
      sites: Array.from({ length: EXPEDITION_LIMITS.sites }, () => site),
    }));
  });
});

describe("users/{uid}/expeditions/{id}/studies", () => {
  it("owner can create, read, relabel and delete", async () => {
    const p = `${EXP}/studies/new`;
    await assertSucceeds(ref(as(A), p).set(validStudy()));
    await assertSucceeds(ref(as(A), p).get());
    await assertSucceeds(ref(as(A), p).update({ label: "Renamed" }));
    await assertSucceeds(ref(as(A), p).delete());
  });
  it("a saved result cannot be edited", async () => {
    await assertFails(ref(as(A), `${EXP}/studies/s1`).update({ result: { sites: [] } }));
    await assertFails(ref(as(A), `${EXP}/studies/s1`).update({ label: "ok", kind: "ranking" }));
    await assertFails(ref(as(A), `${EXP}/studies/s1`).update({ label: "" }));
  });
  it("rejects bad shapes", async () => {
    const p = `${EXP}/studies/bad`;
    await assertFails(ref(as(A), p).set({ ...validStudy(), kind: "report" }));
    await assertFails(ref(as(A), p).set({ ...validStudy(), source: "elsewhere" }));
    await assertFails(ref(as(A), p).set({ ...validStudy(), label: "x".repeat(121) }));
    await assertFails(ref(as(A), p).set({ ...validStudy(), result: "big" }));
    await assertFails(ref(as(A), p).set({ ...validStudy(), extra: true }));
  });
  it("other users are denied", async () => {
    await assertFails(ref(as(B), `${EXP}/studies/s1`).get());
    await assertFails(ref(as(B), `${EXP}/studies/x`).set(validStudy()));
    await assertFails(ref(as(B), `${EXP}/studies/s1`).delete());
  });
});

describe("users/{uid}/expeditions/{id}/chat", () => {
  it("owner can write and read the transcript", async () => {
    await assertSucceeds(ref(as(A), `${EXP}/chat/transcript`).set(validChat()));
    await assertSucceeds(ref(as(A), `${EXP}/chat/transcript`).get());
    await assertSucceeds(ref(as(A), `${EXP}/chat/transcript`).delete());
  });
  it("rejects other doc ids, extra keys and too many messages", async () => {
    await assertFails(ref(as(A), `${EXP}/chat/other`).set(validChat()));
    await assertFails(ref(as(A), `${EXP}/chat/transcript`).set({ ...validChat(), model: "x" }));
    const msg = { role: "user", text: "x" };
    await assertFails(ref(as(A), `${EXP}/chat/transcript`).set({ ...validChat(), messages: Array.from({ length: EXPEDITION_LIMITS.chatMessages + 1 }, () => msg) }));
  });
  it("other users are denied", async () => {
    await assertFails(ref(as(B), `${EXP}/chat/transcript`).get());
    await assertFails(ref(as(B), `${EXP}/chat/transcript`).set(validChat()));
  });
});

describe("public reads stay open", () => {
  it("signed-out visitors can still read the catalog", async () => {
    await assertSucceeds(ref(anon(), "catalog/siteIndex").get());
  });
});
