import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { scienceGet } from "@/lib/api/science";

describe("horizon requests", () => {
  it("does not load ephemeris when a smooth-horizon location needs no terrain tile", async () => {
    const db = { doc: () => { throw new Error("Unexpected database read"); } } as unknown as Firestore;
    const response = await scienceGet(db, "horizon", new URL("https://example.invalid/api/v1/science/horizon?lat=0&lon=10"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.horizon).toBeNull();
    expect(body.source).toContain("smooth horizon");
  });
});
